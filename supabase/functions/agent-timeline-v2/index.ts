import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { callOpenAI } from "../_shared/openai-client.ts";
import { estimatePageFromCharPosition, parseSwedishDate } from "../_shared/page-utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Timeline Agent v2.1 - Extract Timeline Events with Metadata
 * 
 * Scope: Extract timeline events with forensic citations, confidence levels, and structured metadata
 * Philosophy: Skip rather than guess. Zero hallucinations. Evidence-first.
 * 
 * v2 features:
 * - Multiple event types (not just sou_published)
 * - Future date extraction
 * - Confidence scoring (high/medium/low)
 * 
 * v2.1 features:
 * - Structured metadata for committee events (committee_event_kind, role, person_name)
 * - Structured metadata for deadline events (deadline_kind, deadline_index, deadline_label)
 */

interface TimelineAgentRequest {
  document_id: string;
  process_id: string;
  task_id?: string;
}

interface TimelineEventMetadata {
  // For committee_formed events
  committee_event_kind?: 'lead_investigator_appointed' | 'expert_appointed' | 'secretary_appointed' | 'other_member_appointed';
  role?: string;
  person_name?: string;
  
  // For deadline events (remiss_period_end, etc.)
  deadline_kind?: 'interim_report' | 'final_report' | 'other_deadline';
  deadline_index?: number;
  deadline_label?: string;
}

interface TimelineEvent {
  event_type: string;
  event_date: string; // ISO format: YYYY-MM-DD
  description: string;
  source_excerpt: string; // Max 500 chars, exact quote
  source_page: number;
  confidence: 'high' | 'medium' | 'low';
  actors?: Array<{ name: string; role: string }>;
  metadata?: TimelineEventMetadata;
}

// Event types supported in v2
const EVENT_TYPES = [
  'sou_published',
  'directive_issued',
  'committee_formed',
  'remiss_period_start',
  'remiss_period_end',
  'proposition_submitted',
  'law_enacted'
] as const;

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
    const { document_id, process_id, task_id }: TimelineAgentRequest = await req.json();

    console.log('[Timeline Agent v2.1] Starting extraction', { document_id, process_id, task_id });

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
      .select('id, raw_content, pdf_url, title, doc_number, doc_type')
      .eq('id', document_id)
      .single();

    if (docError || !document) {
      throw new Error(`Failed to fetch document: ${docError?.message || 'Not found'}`);
    }

    if (!document.raw_content) {
      console.log('[Timeline Agent v2.1] Skip: No raw_content', { document_id });
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

    // Extract focus content based on document type
    // For SOUs: front matter (first 5000 chars)
    // For directives: full content (important dates throughout)
    // For other types: first 10000 chars
    const docTypeLower = document.doc_type.toLowerCase();
    const contentLength = docTypeLower === 'sou' ? 5000 : 
                          docTypeLower === 'directive' ? 15000 : 10000;
    const focusContent = document.raw_content.substring(0, contentLength);

    console.log('[Timeline Agent v2.1] Extracted focus content', { 
      document_id, 
      doc_type: document.doc_type,
      focusContentLength: focusContent.length 
    });

    // Determine which event types to look for based on document type
    const eventTypesForDoc = getEventTypesForDocument(document.doc_type);

    // OpenAI Tool Schema for timeline event extraction with metadata
    const tool = {
      type: "function" as const,
      function: {
        name: "report_timeline_event",
        description: "Report a timeline event found in the document with forensic citation, confidence level, and structured metadata. Call once per event found.",
        parameters: {
          type: "object",
          properties: {
            event_type: {
              type: "string",
              enum: eventTypesForDoc,
              description: "Type of timeline event being reported"
            },
            event_date: {
              type: "string",
              description: "Event date in ISO format (YYYY-MM-DD). For month-only dates, use first day of month (e.g., 2025-06-01 for 'juni 2025')."
            },
            description: {
              type: "string",
              description: "Brief description of the event (max 200 chars)"
            },
            source_excerpt: {
              type: "string",
              description: "Direct quote from document (50-500 chars) containing the date evidence. Must be exact, verifiable text."
            },
            source_page: {
              type: "number",
              description: "Page number where event is mentioned (estimate from position if needed)"
            },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
              description: "Confidence based on date precision: high = exact day, medium = month+year, low = year only or vague"
            },
            actors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Full name of person involved" },
                  role: { type: "string", description: "Their role (e.g., 'Särskild utredare', 'Statsråd')" }
                },
                required: ["name", "role"]
              },
              description: "People mentioned in connection with the event (optional)"
            },
            metadata: {
              type: "object",
              description: "Structured metadata for committee_formed or deadline events. See prompt for required fields.",
              properties: {
                // Committee event metadata
                committee_event_kind: {
                  type: "string",
                  enum: ["lead_investigator_appointed", "expert_appointed", "secretary_appointed", "other_member_appointed"],
                  description: "For committee_formed: type of appointment"
                },
                role: {
                  type: "string",
                  description: "For committee_formed: Swedish role title exactly as written (e.g., 'särskild utredare', 'sakkunnig')"
                },
                person_name: {
                  type: "string",
                  description: "For committee_formed: person's name exactly as it appears in citation"
                },
                // Deadline event metadata
                deadline_kind: {
                  type: "string",
                  enum: ["interim_report", "final_report", "other_deadline"],
                  description: "For deadline events: type of deadline"
                },
                deadline_index: {
                  type: "number",
                  description: "For deadline events: chronological order within this directive (1, 2, 3...)"
                },
                deadline_label: {
                  type: "string",
                  description: "For deadline events: short Swedish label from document (e.g., 'Delredovisning', 'Slutredovisning')"
                }
              },
              additionalProperties: false
            }
          },
          required: ["event_type", "event_date", "description", "source_excerpt", "source_page", "confidence"],
          additionalProperties: false
        }
      }
    };

    // System prompt for v2.1 with metadata rules
    const systemPrompt = `You are a forensic Timeline Agent (v2.1) analyzing Swedish government documents.

Your task is to extract timeline events with forensic citations, confidence levels, AND structured metadata.

DOCUMENT TYPE: ${document.doc_type}
RELEVANT EVENT TYPES: ${eventTypesForDoc.join(', ')}

EVENT TYPE DEFINITIONS:
- sou_published: SOU report officially published/handed over (look for "Härmed överlämnas...")
- directive_issued: Government directive issued (look for "Beslut vid regeringssammanträde...")
- committee_formed: Person appointed to committee/investigation
- remiss_period_start: Consultation period begins
- remiss_period_end: Consultation deadline (look for "Remissvar ska ha kommit in...", "ska lämnas senast...")
- proposition_submitted: Government proposition submitted to parliament
- law_enacted: Law comes into force (look for "träder i kraft...")

CONFIDENCE SCORING RULES:
- HIGH: Exact date with day specified (e.g., "den 30 november 2025")
- MEDIUM: Month + year specified (e.g., "i juni 2026", "Stockholm i april 2025")
- LOW: Year only, or vague timing (e.g., "under 2027", "våren 2028", "målet är att...")

FUTURE DATES:
- You MAY extract future/planned dates
- These MUST still have citations
- Use appropriate confidence based on linguistic precision
- Common patterns: "Beslut vid regeringssammanträde den...", "Planerat överlämnande...", "ska lämnas senast den..."

### METADATA RULES (IMPORTANT)

In addition to the core fields (event_type, event_date, description, source_page, source_excerpt), you MUST populate the metadata object for certain event types:

#### 1. For committee_formed events:

When you create a committee_formed event based on evidence like:
- "förordnades som särskild utredare"
- "förordnades som sakkunnig"
- "förordnades som sekreterare"

you MUST:
- Set metadata.committee_event_kind to one of:
  - "lead_investigator_appointed" – when a person is appointed as *särskild utredare* or equivalent lead investigator.
  - "expert_appointed" – when a person is appointed as *sakkunnig*, *ämnessakkunnig*, or similar expert role.
  - "secretary_appointed" – when a person is appointed as *sekreterare* or *huvudsekreterare*.
  - "other_member_appointed" – for any other committee membership that does not clearly fit the above.
- Set metadata.role to the Swedish role title exactly as written in the document (e.g., "särskild utredare", "sakkunnig", "ämnessakkunnig").
- Set metadata.person_name to the person's name exactly as it appears in the citation text.

If you are not confident which committee_event_kind applies, you may still create the event if the evidence is strong, but use "other_member_appointed" as the committee_event_kind.

#### 2. For deadline/future date events (e.g., remiss_period_end):

When directives or SOUs contain explicit future deadlines such as:
- "Delredovisningar ska lämnas senast den 31 mars 2027 respektive den 31 mars 2028."
- "Uppdraget ska slutredovisas senast den 31 mars 2029."

and you create an event for those dates, you MUST:
- Set metadata.deadline_kind to one of:
  - "interim_report" – for partial reports / delredovisningar.
  - "final_report" – for final reports / slutredovisning.
  - "other_deadline" – for other explicit "senast den …" style deadlines that are not clearly interim or final reports.
- For each directive with multiple deadlines, assign:
  - metadata.deadline_index starting at 1 in strict chronological order (1, 2, 3, …).
- Set metadata.deadline_label to a short Swedish label taken from the document when possible, e.g., "Delredovisning" or "Slutredovisning".

If you cannot confidently decide whether a deadline is an interim report or a final report, use:
- "deadline_kind": "other_deadline"
- and a neutral deadline_label such as "Tidsfrist".

#### 3. Do NOT invent metadata

- Only populate metadata values that you can directly support with the citation text you provide in source_excerpt.
- If the role or deadline type is unclear, prefer a safe fallback category ("other_member_appointed", "other_deadline") instead of guessing.
- Do NOT invent names, roles, or labels that are not present in the document.

#### 4. Deduplication and re-runs

The system detects duplicate events based on the core fields (process_id, event_type, event_date), NOT on metadata. You may safely re-run on the same document:
- Existing events will be matched as duplicates by their core fields.
- metadata can be updated or refined in subsequent runs without creating duplicate events.

CRITICAL RULES:
1. The source_excerpt MUST contain the date evidence
2. If date is elsewhere but not in excerpt → DO NOT extract
3. Skip rather than guess. If uncertain → DO NOT call the tool
4. One tool call per event found
5. Maximum 8 events per document (allow for multiple committee appointments and deadlines)
6. For committee_formed, create ONE EVENT PER PERSON APPOINTED

PHILOSOPHY: No event is better than an uncertain event. Forensic accuracy over completeness.`;

    const userPrompt = `Analyze this content from document "${document.title}" (${document.doc_number}, type: ${document.doc_type}):

--- CONTENT START ---
${focusContent}
--- CONTENT END ---

Task: Extract timeline events with citations, confidence levels, and structured metadata. Look for ${eventTypesForDoc.join(', ')} events.

Remember:
- Confidence is based on date precision (high=day, medium=month, low=year)
- For committee_formed: include metadata.committee_event_kind, metadata.role, metadata.person_name
- For deadline events: include metadata.deadline_kind, metadata.deadline_index, metadata.deadline_label
- If multiple deadlines exist, number them chronologically (deadline_index: 1, 2, 3...)`;

    // Call OpenAI
    console.log('[Timeline Agent v2.1] Calling OpenAI', { document_id, doc_type: document.doc_type });
    
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
      console.log('[Timeline Agent v2.1] Skip: No tool calls (no valid evidence)', { document_id });
      
      const processingTime = Date.now() - startTime;
      
      if (task_id) {
        await supabase
          .from('agent_tasks')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            output_data: { 
              skipped: true, 
              reason: 'No valid timeline events found',
              processing_time_ms: processingTime,
              model_response: message.content || 'No tool call made'
            }
          })
          .eq('id', task_id);
      }

      return new Response(
        JSON.stringify({ 
          skipped: true, 
          reason: 'No valid evidence found',
          document_id 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Process all tool calls
    const extractedEvents: TimelineEvent[] = [];
    
    for (const toolCall of message.tool_calls) {
      if (toolCall.function.name === 'report_timeline_event') {
        try {
          const event: TimelineEvent = JSON.parse(toolCall.function.arguments);
          extractedEvents.push(event);
        } catch (parseError) {
          console.warn('[Timeline Agent v2.1] Failed to parse tool call', { 
            document_id, 
            error: parseError instanceof Error ? parseError.message : 'Unknown' 
          });
        }
      }
    }

    console.log('[Timeline Agent v2.1] Extracted events', { 
      document_id, 
      count: extractedEvents.length,
      types: extractedEvents.map(e => e.event_type)
    });

    // Process and insert each event
    const insertedEvents: Array<{
      id: string;
      event_type: string;
      event_date: string;
      confidence: string;
      metadata: TimelineEventMetadata;
      action: 'inserted' | 'updated';
    }> = [];
    
    for (const event of extractedEvents) {
      // Validate event data
      if (!event.event_date || !event.source_excerpt) {
        console.warn('[Timeline Agent v2.1] Invalid event, skipping', { 
          document_id, 
          event_type: event.event_type 
        });
        continue;
      }

      // Validate confidence
      if (!['high', 'medium', 'low'].includes(event.confidence)) {
        console.warn('[Timeline Agent v2.1] Invalid confidence, defaulting to medium', { 
          document_id,
          confidence: event.confidence
        });
        event.confidence = 'medium';
      }

      // Truncate excerpt if too long
      let sourceExcerpt = event.source_excerpt;
      if (sourceExcerpt.length > 500) {
        sourceExcerpt = sourceExcerpt.substring(0, 497) + '...';
      }

      // Estimate page if invalid
      let sourcePage = event.source_page;
      if (!sourcePage || sourcePage < 1) {
        const excerptPosition = document.raw_content.indexOf(event.source_excerpt);
        sourcePage = excerptPosition >= 0 
          ? estimatePageFromCharPosition(excerptPosition)
          : 1;
      }

      // Normalize date format
      let normalizedDate = event.event_date;
      if (/^\d{4}-\d{2}$/.test(normalizedDate)) {
        normalizedDate = `${normalizedDate}-01`;
      }

      // Prepare metadata - ensure it's a valid object or empty
      const eventMetadata: TimelineEventMetadata = event.metadata && typeof event.metadata === 'object' 
        ? event.metadata 
        : {};

      // SPECIAL HANDLING: committee_formed events are unique per person per date
      if (event.event_type === 'committee_formed' && eventMetadata?.person_name) {
        const { data: existingCommittee } = await supabase
          .from('timeline_events')
          .select('id, metadata')
          .eq('process_id', process_id)
          .eq('event_type', 'committee_formed')
          .eq('event_date', normalizedDate)
          .contains('metadata', { person_name: eventMetadata.person_name })
          .maybeSingle();

        if (existingCommittee) {
          // This specific person already has an event on this date
          // Update metadata if we have new/richer metadata
          if (Object.keys(eventMetadata).length > 0) {
            const { error: updateError } = await supabase
              .from('timeline_events')
              .update({ metadata: eventMetadata })
              .eq('id', existingCommittee.id);

            if (!updateError) {
              console.log('[Timeline Agent v2.1] ✅ Updated metadata for existing committee event', { 
                document_id,
                event_id: existingCommittee.id,
                event_type: 'committee_formed',
                event_date: normalizedDate,
                person_name: eventMetadata.person_name,
                metadata: eventMetadata
              });
              insertedEvents.push({
                id: existingCommittee.id,
                event_type: 'committee_formed',
                event_date: normalizedDate,
                confidence: event.confidence,
                metadata: eventMetadata,
                action: 'updated'
              });
            }
          } else {
            console.log('[Timeline Agent v2.1] Duplicate committee event, no new metadata', { 
              document_id, 
              event_type: 'committee_formed',
              event_date: normalizedDate,
              person_name: eventMetadata.person_name
            });
          }
          continue; // Don't insert a second identical person-event
        }
        // No existing committee event for this person - fall through to insert
      } else {
        // NON-COMMITTEE EVENTS: Check for duplicate by core fields (process_id, event_type, event_date)
        const { data: existingEvent } = await supabase
          .from('timeline_events')
          .select('id, metadata')
          .eq('process_id', process_id)
          .eq('event_type', event.event_type)
          .eq('event_date', normalizedDate)
          .maybeSingle();

        if (existingEvent) {
          // Duplicate found - update metadata if we have new metadata
          if (Object.keys(eventMetadata).length > 0) {
            const { error: updateError } = await supabase
              .from('timeline_events')
              .update({ metadata: eventMetadata })
              .eq('id', existingEvent.id);

            if (!updateError) {
              console.log('[Timeline Agent v2.1] ✅ Updated metadata for existing event', { 
                document_id,
                event_id: existingEvent.id,
                event_type: event.event_type,
                event_date: normalizedDate,
                metadata: eventMetadata
              });
              insertedEvents.push({
                id: existingEvent.id,
                event_type: event.event_type,
                event_date: normalizedDate,
                confidence: event.confidence,
                metadata: eventMetadata,
                action: 'updated'
              });
            }
          } else {
            console.log('[Timeline Agent v2.1] Duplicate event, no new metadata', { 
              document_id, 
              event_type: event.event_type,
              event_date: normalizedDate
            });
          }
          continue;
        }
      }

      // INSERT NEW EVENT (no duplicate found)
      const { data: insertedEvent, error: insertError } = await supabase
        .from('timeline_events')
        .insert({
          process_id,
          event_type: event.event_type,
          event_date: normalizedDate,
          description: `${event.description} [confidence: ${event.confidence}]`,
          source_page: sourcePage,
          source_excerpt: sourceExcerpt,
          source_url: document.pdf_url,
          actors: event.actors || [],
          metadata: eventMetadata
        })
        .select()
        .single();

      if (insertError) {
        console.error('[Timeline Agent v2.1] Failed to insert event', { 
          document_id,
          event_type: event.event_type,
          error: insertError.message 
        });
        continue;
      }

      insertedEvents.push({
        id: insertedEvent.id,
        event_type: event.event_type,
        event_date: normalizedDate,
        confidence: event.confidence,
        metadata: eventMetadata,
        action: 'inserted'
      });

      console.log('[Timeline Agent v2.1] ✅ Event inserted', { 
        document_id,
        event_id: insertedEvent.id,
        event_type: event.event_type,
        event_date: normalizedDate,
        confidence: event.confidence,
        metadata: eventMetadata
      });
    }

    const processingTime = Date.now() - startTime;
    
    // Calculate inserted vs updated counts
    const eventsInserted = insertedEvents.filter(e => e.action === 'inserted').length;
    const eventsUpdated = insertedEvents.filter(e => e.action === 'updated').length;

    // Update task status
    if (task_id) {
      await supabase
        .from('agent_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          output_data: {
            success: true,
            events_extracted: extractedEvents.length,
            events_inserted: eventsInserted,
            events_updated: eventsUpdated,
            events: insertedEvents,
            processing_time_ms: processingTime
          }
        })
        .eq('id', task_id);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        events_extracted: extractedEvents.length,
        events_inserted: eventsInserted,
        events_updated: eventsUpdated,
        events: insertedEvents,
        processing_time_ms: processingTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Timeline Agent v2.1] ❌ Error:', error);

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

/**
 * Get relevant event types for a document type
 */
function getEventTypesForDocument(docType: string): string[] {
  // Normalize to lowercase for consistent matching
  const normalizedType = docType.toLowerCase();
  
  const mapping: Record<string, string[]> = {
    'sou': ['sou_published', 'committee_formed', 'directive_issued'],
    'directive': ['directive_issued', 'committee_formed', 'remiss_period_end'],
    'proposition': ['proposition_submitted', 'committee_formed'],
    'remiss': ['remiss_period_start', 'remiss_period_end'],
    'committee_report': ['proposition_submitted'],
    'law': ['law_enacted']
  };
  
  return mapping[normalizedType] || EVENT_TYPES.slice();
}
