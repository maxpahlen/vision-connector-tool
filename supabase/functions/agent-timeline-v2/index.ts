import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { callOpenAI } from "../_shared/openai-client.ts";
import { estimatePageFromCharPosition, parseSwedishDate } from "../_shared/page-utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Timeline Agent v2 - Extract Timeline Events with Confidence Scoring
 * 
 * Scope: Extract timeline events with forensic citations and confidence levels
 * Philosophy: Skip rather than guess. Zero hallucinations. Evidence-first.
 * 
 * New in v2:
 * - Multiple event types (not just sou_published)
 * - Future date extraction
 * - Confidence scoring (high/medium/low)
 */

interface TimelineAgentRequest {
  document_id: string;
  process_id: string;
  task_id?: string;
}

interface TimelineEvent {
  event_type: string;
  event_date: string; // ISO format: YYYY-MM-DD
  description: string;
  source_excerpt: string; // Max 500 chars, exact quote
  source_page: number;
  confidence: 'high' | 'medium' | 'low';
  actors?: Array<{ name: string; role: string }>;
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

    console.log('[Timeline Agent v2] Starting extraction', { document_id, process_id, task_id });

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
      console.log('[Timeline Agent v2] Skip: No raw_content', { document_id });
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
    // For other types: first 10000 chars (may have relevant dates deeper in)
    const contentLength = document.doc_type === 'SOU' ? 5000 : 10000;
    const focusContent = document.raw_content.substring(0, contentLength);

    console.log('[Timeline Agent v2] Extracted focus content', { 
      document_id, 
      doc_type: document.doc_type,
      focusContentLength: focusContent.length 
    });

    // Determine which event types to look for based on document type
    const eventTypesForDoc = getEventTypesForDocument(document.doc_type);

    // OpenAI Tool Schema for timeline event extraction
    const tool = {
      type: "function" as const,
      function: {
        name: "report_timeline_event",
        description: "Report a timeline event found in the document with forensic citation and confidence level. Call once per event found.",
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
            }
          },
          required: ["event_type", "event_date", "description", "source_excerpt", "source_page", "confidence"],
          additionalProperties: false
        }
      }
    };

    // System prompt for v2 with confidence scoring
    const systemPrompt = `You are a forensic Timeline Agent (v2) analyzing Swedish government documents.

Your task is to extract timeline events with forensic citations and confidence levels.

DOCUMENT TYPE: ${document.doc_type}
RELEVANT EVENT TYPES: ${eventTypesForDoc.join(', ')}

EVENT TYPE DEFINITIONS:
- sou_published: SOU report officially published/handed over (look for "Härmed överlämnas...")
- directive_issued: Government directive issued (look for "Beslut vid regeringssammanträde...")
- committee_formed: Committee/investigation formally established
- remiss_period_start: Consultation period begins
- remiss_period_end: Consultation deadline (look for "Remissvar ska ha kommit in...")
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
- Common patterns: "Beslut vid regeringssammanträde den...", "Planerat överlämnande..."

CRITICAL RULES:
1. The source_excerpt MUST contain the date evidence
2. If date is elsewhere but not in excerpt → DO NOT extract
3. Skip rather than guess. If uncertain → DO NOT call the tool
4. One tool call per event found
5. Maximum 5 events per document

PHILOSOPHY: No event is better than an uncertain event. Forensic accuracy over completeness.`;

    const userPrompt = `Analyze this content from document "${document.title}" (${document.doc_number}, type: ${document.doc_type}):

--- CONTENT START ---
${focusContent}
--- CONTENT END ---

Task: Extract timeline events with citations and confidence levels. Look for ${eventTypesForDoc.join(', ')} events.
Remember: confidence is based on date precision (high=day, medium=month, low=year).`;

    // Call OpenAI
    console.log('[Timeline Agent v2] Calling OpenAI', { document_id, doc_type: document.doc_type });
    
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
      console.log('[Timeline Agent v2] Skip: No tool calls (no valid evidence)', { document_id });
      
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
          console.warn('[Timeline Agent v2] Failed to parse tool call', { 
            document_id, 
            error: parseError instanceof Error ? parseError.message : 'Unknown' 
          });
        }
      }
    }

    console.log('[Timeline Agent v2] Extracted events', { 
      document_id, 
      count: extractedEvents.length,
      types: extractedEvents.map(e => e.event_type)
    });

    // Process and insert each event
    const insertedEvents = [];
    
    for (const event of extractedEvents) {
      // Validate event data
      if (!event.event_date || !event.source_excerpt) {
        console.warn('[Timeline Agent v2] Invalid event, skipping', { 
          document_id, 
          event_type: event.event_type 
        });
        continue;
      }

      // Validate confidence
      if (!['high', 'medium', 'low'].includes(event.confidence)) {
        console.warn('[Timeline Agent v2] Invalid confidence, defaulting to medium', { 
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

      // Check for duplicate (same process, event_type, and date)
      const { data: existingEvent } = await supabase
        .from('timeline_events')
        .select('id')
        .eq('process_id', process_id)
        .eq('event_type', event.event_type)
        .eq('event_date', normalizedDate)
        .maybeSingle();

      if (existingEvent) {
        console.log('[Timeline Agent v2] Duplicate event, skipping', { 
          document_id, 
          event_type: event.event_type,
          event_date: normalizedDate
        });
        continue;
      }

      // Insert timeline event
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
          actors: event.actors || []
        })
        .select()
        .single();

      if (insertError) {
        console.error('[Timeline Agent v2] Failed to insert event', { 
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
        confidence: event.confidence
      });

      console.log('[Timeline Agent v2] ✅ Event inserted', { 
        document_id,
        event_id: insertedEvent.id,
        event_type: event.event_type,
        event_date: normalizedDate,
        confidence: event.confidence
      });
    }

    const processingTime = Date.now() - startTime;

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
            events_inserted: insertedEvents.length,
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
        events_inserted: insertedEvents.length,
        events: insertedEvents,
        processing_time_ms: processingTime
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Timeline Agent v2] ❌ Error:', error);

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
  const mapping: Record<string, string[]> = {
    'SOU': ['sou_published', 'committee_formed', 'directive_issued'],
    'Dir': ['directive_issued', 'committee_formed'],
    'proposition': ['proposition_submitted', 'committee_formed'],
    'remiss': ['remiss_period_start', 'remiss_period_end'],
    'committee_report': ['proposition_submitted'],
    'law': ['law_enacted']
  };
  
  return mapping[docType] || EVENT_TYPES.slice();
}
