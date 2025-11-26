import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { callOpenAI } from "../_shared/openai-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Metadata Agent v1 - Extract People, Ministries, and Committee Names
 * 
 * Scope: Extract ONLY lead investigators, ministries, and committee names with forensic citations
 * Philosophy: Skip rather than guess. Zero hallucinations. Evidence-first.
 */

interface MetadataAgentRequest {
  document_id: string;
  process_id: string;
  task_id?: string;
}

interface EntityReport {
  entity_type: 'person' | 'ministry' | 'committee';
  name: string;
  role: 'utredare' | 'särskild_utredare' | 'ministry_responsible' | 'committee';
  source_page: number;
  source_excerpt: string;
}

interface MetadataAgentOutput {
  agent_version: '1.0.0';
  model_used: string;
  completed_at: string;
  processing_time_ms: number;
  entities_reported: number;
  entities_created: number;
  entities_reused: number;
  relations_created: number;
  entity_breakdown: {
    person: number;
    ministry: number;
    committee: number;
  };
  analyzed_sections: string[];
  skipped_sections: string[];
  uncertainties: string[];
}

/**
 * Map entity role to relation type
 */
function mapRoleToRelationType(role: string): string {
  const mapping: Record<string, string> = {
    'utredare': 'led_by',
    'särskild_utredare': 'led_by',
    'ministry_responsible': 'commissioned_by',
    'committee': 'conducted_by'
  };
  return mapping[role] || 'related_to';
}

/**
 * Estimate page number from character position in raw_content
 */
function estimatePageFromCharPosition(charPosition: number): number {
  // Rough estimate: ~2000 chars per page (conservative)
  return Math.max(1, Math.floor(charPosition / 2000) + 1);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  const startTime = Date.now();

  try {
    const { document_id, process_id, task_id }: MetadataAgentRequest = await req.json();

    console.log('[Metadata Agent v1] Starting extraction', { document_id, process_id, task_id });

    // Update task status to started if task_id provided
    if (task_id) {
      await supabase
        .from('agent_tasks')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', task_id);
    }

    // Fetch document content and metadata
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, raw_content, pdf_url, title, doc_number')
      .eq('id', document_id)
      .single();

    if (docError || !document) {
      throw new Error(`Failed to fetch document: ${docError?.message || 'Not found'}`);
    }

    if (!document.raw_content) {
      console.log('[Metadata Agent v1] Skip: No raw_content', { document_id });
      if (task_id) {
        await supabase
          .from('agent_tasks')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            output_data: { skipped: true, reason: 'No raw_content available' }
          })
          .eq('id', task_id);
      }
      return new Response(
        JSON.stringify({ skipped: true, reason: 'No raw_content' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract focus sections (first 15000 characters - covers front matter + Uppdraget + Kommittén)
    const focusContent = document.raw_content.substring(0, 15000);

    console.log('[Metadata Agent v1] Extracted focus content', { 
      document_id, 
      focusContentLength: focusContent.length 
    });

    // OpenAI Tool Schema for metadata extraction
    const tool = {
      type: "function" as const,
      function: {
        name: "report_metadata_entity",
        description: "Report a single entity (person, ministry, committee) found in the SOU with forensic citation. Call this once for each entity you find with clear evidence.",
        parameters: {
          type: "object",
          properties: {
            entity_type: {
              type: "string",
              enum: ["person", "ministry", "committee"],
              description: "Type of entity being reported"
            },
            name: {
              type: "string",
              description: "Entity name exactly as written in document. Do NOT normalize or standardize."
            },
            role: {
              type: "string",
              enum: ["utredare", "särskild_utredare", "ministry_responsible", "committee"],
              description: "Specific role: 'utredare' or 'särskild_utredare' for lead investigators, 'ministry_responsible' for the commissioning ministry, 'committee' for committee name"
            },
            source_page: {
              type: "number",
              description: "Page number where entity is mentioned. Estimate from position in text if page markers not present."
            },
            source_excerpt: {
              type: "string",
              description: "Direct quote from document (50-200 chars) proving the entity's role. Must be exact, verifiable text."
            }
          },
          required: ["entity_type", "name", "role", "source_page", "source_excerpt"],
          additionalProperties: false
        }
      }
    };

    // System prompt emphasizing v1 scope and citation-first principle
    const systemPrompt = `You are a Metadata Extraction Agent analyzing Swedish government reports (SOUs).

MISSION:
Extract people, ministries, and committee names mentioned in the SOU with forensic-grade citations.

CITATION POLICY (NON-NEGOTIABLE):
- Only extract entities if you can cite BOTH:
  1. Specific page number in the PDF (estimate from text position if needed)
  2. Direct quote (50-200 chars) proving the entity's role
- If you cannot find a clear citation → do not report the entity
- Never invent or infer names, ministries, or roles

SCOPE (v1 - STRICTLY LIMITED):
Extract ONLY these entity types:

1. **Lead investigator** (utredare / särskild utredare)
   - Look for phrases like: "Som särskild utredare förordnades...", "Utredare:", "Särskild utredare:"
   - Extract name exactly as written (e.g., "Anna Svensson", "Lars Andersson")
   - Role: Use 'särskild_utredare' if title mentions "särskild", otherwise 'utredare'

2. **Responsible ministry** (departement)
   - Look for phrases like: "...har tillkallat en utredning...", "beslutade [ministry] att tillkalla..."
   - Common ministries: Justitiedepartementet, Näringsdepartementet, Finansdepartementet, etc.
   - Role: Always 'ministry_responsible'
   - Extract Swedish name as written in document

3. **Committee name** (optional but include if trivial)
   - Look for: "Utredningen om...", "Kommittén för...", committee identifiers like "(Fi 2024:03)"
   - Role: 'committee'
   - Include full name as stated

DO NOT EXTRACT (deferred to future phases):
- Secretariat members
- Experts or expert groups
- Reference groups (remissinstanser)
- Deadlines or mandatperiod
- Tilläggsdirektiv
- Anyone except the lead investigator

EXTRACTION RULES:
1. Extract names EXACTLY as written (no normalization)
2. If multiple name variants exist, extract each with separate citations
3. One entity = one tool call with citation
4. If uncertain about a name or role → skip it
5. Ministry names: prefer Swedish form found in document
6. Call the tool multiple times (once per entity found)

OUTPUT TRANSPARENCY:
After your tool calls, briefly note:
- Which sections you analyzed (e.g., "Analyzed: Uppdraget, Kommittén, pages 1-8")
- Which sections you skipped (e.g., "Skipped: Bilagor, pages 100+")
- Any uncertainties (e.g., "Ministry name unclear on page 5")`;

    const userPrompt = `Analyze this content from SOU document "${document.title}" (${document.doc_number}):

--- CONTENT START ---
${focusContent}
--- CONTENT END ---

Task: Extract lead investigator, responsible ministry, and committee name (if clearly stated) using the report_metadata_entity tool. Call the tool once for each entity you find with valid citation. Remember: citation-first principle - no citation = no extraction.`;

    // Call OpenAI with tool schema
    console.log('[Metadata Agent v1] Calling OpenAI', { document_id });
    
    const completion = await callOpenAI(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      [tool],
      {
        model: "gpt-4o-mini",
        temperature: 0.1, // Low temperature for consistency
      }
    );

    const message = completion.choices[0].message;
    
    // Check if any tools were called
    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.log('[Metadata Agent v1] Skip: No tool calls (no valid evidence)', { document_id });
      
      const processingTime = Date.now() - startTime;
      const outputData: MetadataAgentOutput = {
        agent_version: '1.0.0',
        model_used: "gpt-4o-mini",
        completed_at: new Date().toISOString(),
        processing_time_ms: processingTime,
        entities_reported: 0,
        entities_created: 0,
        entities_reused: 0,
        relations_created: 0,
        entity_breakdown: { person: 0, ministry: 0, committee: 0 },
        analyzed_sections: ["Front matter", "First 15000 characters"],
        skipped_sections: ["Annexes", "Remaining document"],
        uncertainties: message.content ? [message.content] : []
      };
      
      if (task_id) {
        await supabase
          .from('agent_tasks')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            output_data: outputData
          })
          .eq('id', task_id);
      }

      return new Response(
        JSON.stringify({ 
          skipped: true, 
          reason: 'No valid metadata evidence found',
          output_data: outputData
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process all tool calls (entity reports)
    const extractedEntities: EntityReport[] = [];
    
    for (const toolCall of message.tool_calls) {
      if (toolCall.function.name === 'report_metadata_entity') {
        try {
          const entity: EntityReport = JSON.parse(toolCall.function.arguments);
          extractedEntities.push(entity);
        } catch (parseError) {
          console.warn('[Metadata Agent v1] Failed to parse tool call', { 
            document_id, 
            error: parseError instanceof Error ? parseError.message : 'Unknown' 
          });
        }
      }
    }

    console.log('[Metadata Agent v1] Extracted entities', { 
      document_id, 
      count: extractedEntities.length,
      types: extractedEntities.map(e => e.entity_type)
    });

    // Process each entity: create or reuse + create relation
    let entitiesCreated = 0;
    let entitiesReused = 0;
    let relationsCreated = 0;
    const entityBreakdown = { person: 0, ministry: 0, committee: 0 };

    for (const entity of extractedEntities) {
      // Validate entity data
      if (!entity.name || !entity.source_excerpt || !entity.source_page) {
        console.warn('[Metadata Agent v1] Invalid entity, skipping', { 
          document_id, 
          entity: entity.name 
        });
        continue;
      }

      // Truncate excerpt if too long
      let sourceExcerpt = entity.source_excerpt;
      if (sourceExcerpt.length > 500) {
        sourceExcerpt = sourceExcerpt.substring(0, 497) + '...';
      }

      // Estimate page if not provided or invalid
      let sourcePage = entity.source_page;
      if (!sourcePage || sourcePage < 1) {
        const excerptPosition = document.raw_content.indexOf(entity.source_excerpt);
        sourcePage = excerptPosition >= 0 
          ? estimatePageFromCharPosition(excerptPosition)
          : 1;
      }

      // Check if entity already exists (deduplication by entity_type + name)
      const { data: existingEntity } = await supabase
        .from('entities')
        .select('id')
        .eq('entity_type', entity.entity_type)
        .eq('name', entity.name)
        .maybeSingle();

      let entityId: string;

      if (existingEntity) {
        // Entity exists, reuse it
        entityId = existingEntity.id;
        entitiesReused++;
        console.log('[Metadata Agent v1] Reusing existing entity', { 
          document_id, 
          entity_id: entityId,
          name: entity.name 
        });
      } else {
        // Create new entity
        const { data: newEntity, error: entityError } = await supabase
          .from('entities')
          .insert({
            entity_type: entity.entity_type,
            name: entity.name,
            role: entity.role,
            source_document_id: document_id,
            source_page: sourcePage,
            source_excerpt: sourceExcerpt
          })
          .select('id')
          .single();

        if (entityError || !newEntity) {
          console.error('[Metadata Agent v1] Failed to create entity', { 
            document_id,
            entity: entity.name,
            error: entityError?.message 
          });
          continue;
        }

        entityId = newEntity.id;
        entitiesCreated++;
        console.log('[Metadata Agent v1] Created new entity', { 
          document_id, 
          entity_id: entityId,
          name: entity.name,
          type: entity.entity_type
        });
      }

      // Create relation (always, even if entity was reused)
      const relationType = mapRoleToRelationType(entity.role);
      
      const { error: relationError } = await supabase
        .from('relations')
        .insert({
          source_id: entityId,
          source_type: 'entity',
          target_id: document_id,
          target_type: 'document',
          relation_type: relationType,
          source_document_id: document_id,
          source_page: sourcePage,
          source_excerpt: sourceExcerpt,
          metadata: {
            extraction_date: new Date().toISOString(),
            agent_version: '1.0.0',
            role: entity.role
          }
        });

      if (relationError) {
        console.error('[Metadata Agent v1] Failed to create relation', { 
          document_id,
          entity_id: entityId,
          error: relationError.message 
        });
        continue;
      }

      relationsCreated++;
      entityBreakdown[entity.entity_type]++;
      
      console.log('[Metadata Agent v1] Created relation', { 
        document_id,
        entity_id: entityId,
        relation_type: relationType
      });
    }

    const processingTime = Date.now() - startTime;

    // Build output data
    const outputData: MetadataAgentOutput = {
      agent_version: '1.0.0',
      model_used: "gpt-4o-mini",
      completed_at: new Date().toISOString(),
      processing_time_ms: processingTime,
      entities_reported: extractedEntities.length,
      entities_created: entitiesCreated,
      entities_reused: entitiesReused,
      relations_created: relationsCreated,
      entity_breakdown: entityBreakdown,
      analyzed_sections: [
        "Front matter",
        "Uppdraget section",
        "Kommittén section",
        "First 15000 characters"
      ],
      skipped_sections: [
        "Bilagor (Annexes)",
        "Table of contents",
        "Detailed appendices",
        "Content beyond first 15000 chars"
      ],
      uncertainties: []
    };

    console.log('[Metadata Agent v1] ✅ Success', { 
      document_id,
      entities_created: entitiesCreated,
      entities_reused: entitiesReused,
      relations_created: relationsCreated,
      processing_time_ms: processingTime
    });

    // Update task status to completed
    if (task_id) {
      await supabase
        .from('agent_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          output_data: outputData
        })
        .eq('id', task_id);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        output_data: outputData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Metadata Agent v1] ❌ Error:', error);

    const { task_id } = await req.json().catch(() => ({}));
    
    if (task_id) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      
      await supabase
        .from('agent_tasks')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error instanceof Error ? error.message : 'Unknown error',
          output_data: { error: error instanceof Error ? error.message : 'Unknown error' }
        })
        .eq('id', task_id);
    }

    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
