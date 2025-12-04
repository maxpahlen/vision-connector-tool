import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { callOpenAI } from "../_shared/openai-client.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Metadata Agent v2.2 - Document Type Aware Entity Extraction
 * 
 * Now supports:
 * - SOUs/Directives: Extract lead investigators (utredare)
 * - Propositions: Extract ministers and political office holders
 * 
 * Philosophy: Skip rather than guess. Zero hallucinations. Evidence-first.
 */

interface MetadataAgentRequest {
  document_id: string;
  process_id: string;
  task_id?: string;
}

// Extended role types for propositions
type EntityRole = 
  | 'utredare' 
  | 'särskild_utredare' 
  | 'committee'
  // Proposition-specific roles (Swedish titles)
  | 'minister'
  | 'statsråd'
  | 'departementschef'
  | 'statssekreterare';

interface EntityReport {
  entity_type: 'person' | 'committee';
  name: string;
  role: string; // Swedish title from document
  role_normalized?: string; // Optional normalized category
  source_page: number;
  source_excerpt: string;
}

interface MetadataAgentOutput {
  agent_version: '2.2.0';
  model_used: string;
  document_type: string;
  completed_at: string;
  processing_time_ms: number;
  entities_reported: number;
  entities_created: number;
  entities_reused: number;
  relations_created: number;
  entity_breakdown: {
    person: number;
    committee: number;
  };
  analyzed_sections: string[];
  skipped_sections: string[];
  uncertainties: string[];
}

/**
 * Map entity role to relation type
 */
function mapRoleToRelationType(role: string, docType: string): string {
  // For propositions: ministers are "signed_by"
  if (docType === 'proposition') {
    const lowerRole = role.toLowerCase();
    if (lowerRole.includes('minister') || lowerRole === 'statsråd' || lowerRole === 'departementschef') {
      return 'signed_by';
    }
  }
  
  // For SOUs/directives: investigators "led_by"
  const mapping: Record<string, string> = {
    'utredare': 'led_by',
    'särskild_utredare': 'led_by',
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

/**
 * Get system prompt based on document type
 */
function getSystemPrompt(docType: string): string {
  if (docType === 'proposition') {
    return `You are a Metadata Extraction Agent analyzing Swedish Government Propositions (propositioner).

MISSION:
Extract ministers and political office holders mentioned in the document with forensic-grade citations.

CITATION POLICY (NON-NEGOTIABLE):
- Only extract entities if you can cite BOTH:
  1. Specific page number in the PDF (estimate from text position if needed)
  2. Direct quote (50-200 chars) proving the entity's role
- If you cannot find a clear citation → do not report the entity
- Never invent or infer names or roles

SCOPE (PROPOSITIONS ONLY):
Extract ministers and political office holders:

1. **Ministers / Statsråd** (REQUIRED for propositions)
   - Look for: signature blocks, "Förord", "Undertecknat av", ministerial introductions
   - Look for titles like: "justitieminister", "försvarsminister", "finansminister", 
     "utbildningsminister", "skolminister", "socialminister", "kulturminister",
     "klimatminister", "näringsminister", "energi- och näringsminister", "statsråd",
     "civilminister", "arbetsmarknadsminister", "utrikesminister", etc.
   - CRITICAL: Extract the ACTUAL NAME of the person (first + surname)
   - The role field should contain the EXACT Swedish title from the document
   
2. **Other government officials** (optional)
   - Statssekreterare, departementschef
   - Only if clearly stated with name

CRITICAL - DO NOT EXTRACT THESE ROLES:
- "utredare" or "särskild utredare" (these are for SOUs, NOT propositions)
- "expert" or "sakkunnig" (committee roles)
- Generic committee references

PERSON NAME VALIDATION:
- MUST be actual first name + surname (e.g., "Carl-Oskar Bohlin", "Niklas Wykman")
- MUST NOT be just a title (e.g., "justitieministern", "försvarsministern")
- If only title appears without a name → skip it

ROLE FIELD:
- Copy the EXACT Swedish title from the document (e.g., "justitieminister", "statsråd")
- Do NOT use "utredare" or committee-style roles for propositions

EXTRACTION RULES:
1. Extract names EXACTLY as written (no normalization)
2. One entity = one tool call with citation
3. If uncertain about a name or role → skip it
4. Look especially in signature blocks at the end of the document

OUTPUT TRANSPARENCY:
After your tool calls, briefly note:
- Which sections you analyzed
- Any uncertainties`;
  }
  
  // Default: SOU/Directive prompt
  return `You are a Metadata Extraction Agent analyzing Swedish government reports (SOUs and directives).

MISSION:
Extract lead investigators and committee names mentioned in the document with forensic-grade citations.

CITATION POLICY (NON-NEGOTIABLE):
- Only extract entities if you can cite BOTH:
  1. Specific page number in the PDF (estimate from text position if needed)
  2. Direct quote (50-200 chars) proving the entity's role
- If you cannot find a clear citation → do not report the entity
- Never invent or infer names or roles

SCOPE (SOUs and DIRECTIVES):
Extract ONLY these entity types:

1. **Lead investigator** (utredare / särskild utredare)
   - Look for phrases like: "Som särskild utredare förordnades...", "Utredare:", "Särskild utredare:"
   - CRITICAL: Extract ONLY actual NAMES containing first name + surname (e.g., "Peter Norman", "Anna Lindh")
   - DO NOT extract role titles alone (e.g., "Särskild utredare", "Samordnaren", "Ordföranden")
   - If only a role title appears WITHOUT an actual name → skip it
   - Role: Use 'särskild_utredare' if title mentions "särskild", otherwise 'utredare'

2. **Committee name** (optional but include if clearly stated)
   - Look for: "Utredningen om...", "Kommittén för...", committee identifiers like "(Fi 2024:03)"
   - Role: 'committee'
   - Include full name as stated

DO NOT EXTRACT (explicitly out of scope):
- Ministry (already available in documents.ministry from scraper)
- Ministers (these are for propositions, not SOUs)
- Secretariat members
- Experts or expert groups
- Reference groups (remissinstanser)
- Deadlines or mandatperiod

PERSON NAME VALIDATION RULES:
- MUST contain at least first name + surname (requires at least one space)
- MUST NOT be just a role title
- Valid examples: "Peter Norman", "Anna Svensson", "Lars-Erik Andersson"
- Invalid examples: "Särskild utredare", "Utredaren", "Samordnaren"

EXTRACTION RULES:
1. Extract names EXACTLY as written (no normalization)
2. If multiple name variants exist, extract each with separate citations
3. One entity = one tool call with citation
4. If uncertain about a name or role → skip it

OUTPUT TRANSPARENCY:
After your tool calls, briefly note:
- Which sections you analyzed
- Any uncertainties`;
}

/**
 * Get tool schema based on document type
 */
function getToolSchema(docType: string) {
  const roleEnum = docType === 'proposition'
    ? ["minister", "statsråd", "departementschef", "statssekreterare", "committee"]
    : ["utredare", "särskild_utredare", "committee"];
    
  const roleDescription = docType === 'proposition'
    ? "Swedish title exactly as written in document (e.g., 'justitieminister', 'försvarsminister', 'statsråd')"
    : "Specific role: 'utredare' or 'särskild_utredare' for lead investigators, 'committee' for committee name";

  return {
    type: "function" as const,
    function: {
      name: "report_metadata_entity",
      description: `Report a single entity found in the document with forensic citation. Call this once for each entity you find with clear evidence.`,
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            enum: ["person", "committee"],
            description: "Type of entity being reported"
          },
          name: {
            type: "string",
            description: "Entity name exactly as written in document. For persons: MUST be actual first + surname (e.g., 'Carl-Oskar Bohlin'), NOT role titles."
          },
          role: {
            type: "string",
            description: roleDescription
          },
          source_page: {
            type: "number",
            description: "Page number where entity is mentioned. Estimate from position in text if page markers not present."
          },
          source_excerpt: {
            type: "string",
            description: "Direct quote from document (50-500 chars) proving the entity's role. Must be exact, verifiable text."
          }
        },
        required: ["entity_type", "name", "role", "source_page", "source_excerpt"],
        additionalProperties: false
      }
    }
  };
}

/**
 * Validate person entity based on document type
 */
function validatePersonEntity(name: string, role: string, docType: string): { valid: boolean; reason?: string } {
  const trimmedName = name.trim();
  
  // Basic validations (apply to all doc types)
  if (!trimmedName) {
    return { valid: false, reason: 'empty name' };
  }
  
  if (trimmedName.includes('(') || trimmedName.includes(')')) {
    return { valid: false, reason: 'contains parentheses/placeholder' };
  }
  
  if (!trimmedName.includes(' ')) {
    return { valid: false, reason: 'no space in name (missing surname)' };
  }
  
  if (!/[a-zA-ZåäöÅÄÖ]/.test(trimmedName)) {
    return { valid: false, reason: 'no alphabetical characters' };
  }
  
  const lowerName = trimmedName.toLowerCase();
  
  // Reject ministry/department names
  if (lowerName.endsWith('departementet')) {
    return { valid: false, reason: 'ministry name detected' };
  }
  
  // Common placeholder stoplist (all doc types)
  const commonStoplist = [
    'not specified',
    '(not specified)',
    'okänd',
    'ej angiven',
  ];
  
  if (commonStoplist.includes(lowerName)) {
    return { valid: false, reason: 'placeholder/stoplist match' };
  }
  
  // Document type specific validation
  if (docType === 'proposition') {
    // For propositions: reject minister title-only entries (when used as name)
    const ministerTitleOnlyPatterns = [
      /^(justitie|försvars|finans|utbildnings|skol|social|kultur|klimat|närings|civil|arbetsmarknads|utrikes)ministern?$/i,
      /^statsrådet$/i,
      /^departementschefen$/i,
    ];
    
    if (ministerTitleOnlyPatterns.some(p => p.test(lowerName))) {
      return { valid: false, reason: 'minister title without actual name' };
    }
    
    // Reject SOU-style roles being used in propositions
    const souRoles = ['utredare', 'särskild utredare', 'samordnaren', 'ordföranden', 'utredaren'];
    if (souRoles.includes(lowerName) || souRoles.some(r => lowerName.startsWith(r + ' '))) {
      return { valid: false, reason: 'SOU-style role used in proposition' };
    }
  } else {
    // For SOUs/directives: existing validation
    const roleStoplist = [
      'särskild utredare',
      'samordnaren',
      'ordföranden',
      'utredaren',
      'särskilde utredaren',
      'vice ordföranden',
      'sekreteraren',
      'kommittén'
    ];
    
    if (roleStoplist.some(r => lowerName === r || lowerName.startsWith(r + ' ') || lowerName.endsWith(' ' + r))) {
      return { valid: false, reason: 'role title detected' };
    }
    
    // Minister titles in SOU context (shouldn't extract these for SOUs)
    if (lowerName.endsWith('minister') || lowerName.endsWith('ministern')) {
      return { valid: false, reason: 'minister title in SOU context' };
    }
    
    const souPlaceholders = [
      'socialtjänstministern',
      'klimatministern',
      'näringsministern',
      'utbildningsministern',
      'justitieministern'
    ];
    
    if (souPlaceholders.includes(lowerName)) {
      return { valid: false, reason: 'minister placeholder in SOU' };
    }
  }
  
  return { valid: true };
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

    console.log('[Metadata Agent v2.2] Starting extraction', { document_id, process_id, task_id });

    // Update task status to started if task_id provided
    if (task_id) {
      await supabase
        .from('agent_tasks')
        .update({ status: 'running', started_at: new Date().toISOString() })
        .eq('id', task_id);
    }

    // Fetch document content and metadata INCLUDING doc_type
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, raw_content, pdf_url, title, doc_number, doc_type')
      .eq('id', document_id)
      .single();

    if (docError || !document) {
      throw new Error(`Failed to fetch document: ${docError?.message || 'Not found'}`);
    }

    const docType = document.doc_type || 'sou'; // Default to SOU for backwards compatibility
    
    console.log('[Metadata Agent v2.2] Document type detected', { document_id, doc_type: docType });

    if (!document.raw_content) {
      console.log('[Metadata Agent v2.2] Skip: No raw_content', { document_id });
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

    // For propositions, look at both start and end (signature blocks are often at end)
    const focusContentStart = document.raw_content.substring(0, 15000);
    const focusContentEnd = docType === 'proposition' 
      ? document.raw_content.substring(Math.max(0, document.raw_content.length - 10000))
      : '';
    
    const focusContent = docType === 'proposition'
      ? `--- BEGINNING OF DOCUMENT ---\n${focusContentStart}\n\n--- END OF DOCUMENT (last 10000 chars) ---\n${focusContentEnd}`
      : focusContentStart;

    console.log('[Metadata Agent v2.2] Extracted focus content', { 
      document_id, 
      focusContentLength: focusContent.length,
      doc_type: docType
    });

    // Get document-type-specific prompt and tool schema
    const systemPrompt = getSystemPrompt(docType);
    const tool = getToolSchema(docType);

    const userPrompt = `Analyze this content from ${docType === 'proposition' ? 'proposition' : 'report'} "${document.title}" (${document.doc_number}):

--- CONTENT START ---
${focusContent}
--- CONTENT END ---

Task: Extract ${docType === 'proposition' ? 'ministers and political office holders' : 'lead investigators and committee names'} using the report_metadata_entity tool. Call the tool once for each entity you find with valid citation. Remember: citation-first principle - no citation = no extraction.`;

    // Call OpenAI with tool schema
    console.log('[Metadata Agent v2.2] Calling OpenAI', { document_id, doc_type: docType });
    
    const completion = await callOpenAI(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      [tool],
      {
        model: "gpt-4o-mini",
        temperature: 0.1,
      }
    );

    const message = completion.choices[0].message;
    
    // Check if any tools were called
    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.log('[Metadata Agent v2.2] Skip: No tool calls (no valid evidence)', { document_id, doc_type: docType });
      
      const processingTime = Date.now() - startTime;
      const outputData: MetadataAgentOutput = {
        agent_version: '2.2.0',
        model_used: "gpt-4o-mini",
        document_type: docType,
        completed_at: new Date().toISOString(),
        processing_time_ms: processingTime,
        entities_reported: 0,
        entities_created: 0,
        entities_reused: 0,
        relations_created: 0,
        entity_breakdown: { person: 0, committee: 0 },
        analyzed_sections: docType === 'proposition' 
          ? ["Front matter", "Signature blocks", "First 15000 + last 10000 characters"]
          : ["Front matter", "First 15000 characters"],
        skipped_sections: ["Middle sections", "Detailed appendices"],
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
          console.warn('[Metadata Agent v2.2] Failed to parse tool call', { 
            document_id, 
            error: parseError instanceof Error ? parseError.message : 'Unknown' 
          });
        }
      }
    }

    console.log('[Metadata Agent v2.2] Extracted entities', { 
      document_id, 
      doc_type: docType,
      count: extractedEntities.length,
      entities: extractedEntities.map(e => ({ name: e.name, role: e.role, type: e.entity_type }))
    });

    // Process each entity: create or reuse + create relation
    let entitiesCreated = 0;
    let entitiesReused = 0;
    let relationsCreated = 0;
    const entityBreakdown = { person: 0, committee: 0 };

    for (const entity of extractedEntities) {
      // Validate entity data
      if (!entity.name || !entity.source_excerpt || !entity.source_page) {
        console.warn('[Metadata Agent v2.2] Invalid entity, skipping', { 
          document_id, 
          entity: entity.name 
        });
        continue;
      }

      // Validate person entities with doc-type-aware rules
      if (entity.entity_type === 'person') {
        const validation = validatePersonEntity(entity.name, entity.role, docType);
        if (!validation.valid) {
          console.warn(`[Metadata Agent v2.2] Rejecting person entity (${validation.reason})`, { 
            document_id, 
            rejected_name: entity.name,
            doc_type: docType
          });
          continue;
        }
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
        console.log('[Metadata Agent v2.2] Reusing existing entity', { 
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
            role: entity.role, // Store exact Swedish title
            source_document_id: document_id,
            source_page: sourcePage,
            source_excerpt: sourceExcerpt,
            metadata: {
              doc_type_source: docType,
              extraction_version: '2.2.0'
            }
          })
          .select('id')
          .single();

        if (entityError || !newEntity) {
          console.error('[Metadata Agent v2.2] Failed to create entity', { 
            document_id,
            entity: entity.name,
            error: entityError?.message 
          });
          continue;
        }

        entityId = newEntity.id;
        entitiesCreated++;
        console.log('[Metadata Agent v2.2] Created new entity', { 
          document_id, 
          entity_id: entityId,
          name: entity.name,
          role: entity.role,
          type: entity.entity_type
        });
      }

      // Check if relation already exists (deduplication)
      const relationType = mapRoleToRelationType(entity.role, docType);
      
      const { data: existingRelation } = await supabase
        .from('relations')
        .select('id')
        .eq('source_id', entityId)
        .eq('target_id', document_id)
        .eq('relation_type', relationType)
        .maybeSingle();

      if (existingRelation) {
        console.log('[Metadata Agent v2.2] Relation already exists, skipping', { 
          document_id,
          entity_id: entityId,
          relation_id: existingRelation.id,
          relation_type: relationType
        });
        entityBreakdown[entity.entity_type]++;
        continue;
      }

      // Create relation
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
            agent_version: '2.2.0',
            role: entity.role,
            doc_type: docType
          }
        });

      if (relationError) {
        console.error('[Metadata Agent v2.2] Failed to create relation', { 
          document_id,
          entity_id: entityId,
          error: relationError.message 
        });
        continue;
      }

      relationsCreated++;
      entityBreakdown[entity.entity_type]++;
      
      console.log('[Metadata Agent v2.2] Created relation', { 
        document_id,
        entity_id: entityId,
        relation_type: relationType
      });
    }

    const processingTime = Date.now() - startTime;

    // Build output data
    const outputData: MetadataAgentOutput = {
      agent_version: '2.2.0',
      model_used: "gpt-4o-mini",
      document_type: docType,
      completed_at: new Date().toISOString(),
      processing_time_ms: processingTime,
      entities_reported: extractedEntities.length,
      entities_created: entitiesCreated,
      entities_reused: entitiesReused,
      relations_created: relationsCreated,
      entity_breakdown: entityBreakdown,
      analyzed_sections: docType === 'proposition'
        ? ["Front matter", "Förord", "Signature blocks", "First 15000 + last 10000 chars"]
        : ["Front matter", "Uppdraget section", "Kommittén section", "First 15000 characters"],
      skipped_sections: [
        "Middle sections",
        "Bilagor (Annexes)",
        "Detailed appendices"
      ],
      uncertainties: []
    };

    console.log('[Metadata Agent v2.2] ✅ Success', { 
      document_id,
      doc_type: docType,
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
        entities_created: entitiesCreated,
        entities_reused: entitiesReused,
        relations_created: relationsCreated,
        output_data: outputData
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Metadata Agent v2.2] ❌ Error:', error);

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
