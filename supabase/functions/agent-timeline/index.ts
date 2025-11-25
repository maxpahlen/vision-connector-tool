import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { callOpenAI } from "../_shared/openai-client.ts";
import { estimatePageFromCharPosition, parseSwedishDate } from "../_shared/page-utils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Timeline Agent v1 - Extract sou_published Events
 * 
 * Scope: Extract ONLY sou_published timeline events with forensic citations
 * Philosophy: Skip rather than guess. Zero hallucinations. Evidence-first.
 */

interface TimelineAgentRequest {
  document_id: string;
  process_id: string;
  task_id?: string;
}

interface SouPublishedEvent {
  event_date: string; // ISO format: YYYY-MM or YYYY-MM-DD
  description: string;
  source_excerpt: string; // Max 500 chars, exact quote
  confidence: 'high' | 'medium';
  actors?: Array<{ name: string; role: string }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const { document_id, process_id, task_id }: TimelineAgentRequest = await req.json();

    console.log('[Timeline Agent v1] Starting extraction', { document_id, process_id, task_id });

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
      console.log('[Timeline Agent v1] Skip: No raw_content', { document_id });
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

    // Extract front matter (first 5000 characters)
    const frontMatter = document.raw_content.substring(0, 5000);

    console.log('[Timeline Agent v1] Extracted front matter', { 
      document_id, 
      frontMatterLength: frontMatter.length 
    });

    // OpenAI Tool Schema for sou_published extraction
    const tool = {
      type: "function" as const,
      function: {
        name: "report_sou_published_event",
        description: "Report a confirmed SOU publication event with forensic citations. ONLY call this if you find BOTH a handover statement (e.g., 'Härmed överlämnas') AND a date with at least month + year in the SAME excerpt.",
        parameters: {
          type: "object",
          properties: {
            event_date: {
              type: "string",
              description: "Publication date in ISO format (YYYY-MM or YYYY-MM-DD). Extract from phrases like 'Stockholm i april 2025' or 'den 7 april 2025'."
            },
            description: {
              type: "string",
              description: "Brief description of the publication event (max 200 chars). Example: 'SOU 2025:32 officially published and handed over to the government.'"
            },
            source_excerpt: {
              type: "string",
              description: "Exact quote from the document containing BOTH the handover statement AND the date. Maximum 500 characters. Must be verifiable in the source."
            },
            confidence: {
              type: "string",
              enum: ["high", "medium"],
              description: "High: Exact date with day. Medium: Month and year only."
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
              description: "People mentioned in the handover (investigators, ministers, etc.)"
            }
          },
          required: ["event_date", "description", "source_excerpt", "confidence"],
          additionalProperties: false
        }
      }
    };

    // System prompt emphasizing forensic accuracy
    const systemPrompt = `You are a forensic Timeline Agent analyzing Swedish SOU (Statens Offentliga Utredningar) documents.

Your ONLY task is to extract sou_published events from the front matter of the document.

CRITICAL RULES:
1. ONLY call the tool if you find BOTH:
   - A handover statement like "Härmed överlämnas..." (formal handover to government)
   - A date with at least MONTH + YEAR in the SAME excerpt (e.g., "Stockholm i april 2025", "den 7 april 2025")

2. The source_excerpt MUST contain BOTH the handover statement AND the date together

3. If the date is elsewhere in the document but not near the handover statement → DO NOT extract

4. Skip rather than guess. If uncertain → DO NOT call the tool

5. The excerpt must be an EXACT quote, maximum 500 characters

PHILOSOPHY: No event is better than an uncertain event. We prioritize forensic accuracy over completeness.`;

    const userPrompt = `Analyze this front matter from SOU document "${document.title}" (${document.doc_number}):

--- FRONT MATTER START ---
${frontMatter}
--- FRONT MATTER END ---

Task: Extract the sou_published event if valid evidence exists. Remember: ONLY call the tool if you find both the handover statement AND a date with month+year in the SAME excerpt.`;

    // Call OpenAI with strict tool schema
    console.log('[Timeline Agent v1] Calling OpenAI', { document_id });
    
    const completion = await callOpenAI(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      [tool],
      {
        model: "gpt-4o-mini",
        temperature: 0.1, // Low temperature for consistency
        toolChoice: { type: "function", function: { name: "report_sou_published_event" } }
      }
    );

    const message = completion.choices[0].message;
    
    // Check if tool was called
    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.log('[Timeline Agent v1] Skip: No tool call (no valid evidence)', { document_id });
      
      if (task_id) {
        await supabase
          .from('agent_tasks')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            output_data: { 
              skipped: true, 
              reason: 'No valid sou_published evidence found in front matter',
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

    // Parse tool call result
    const toolCall = message.tool_calls[0];
    const extractedEvent: SouPublishedEvent = JSON.parse(toolCall.function.arguments);

    console.log('[Timeline Agent v1] Extracted event', { 
      document_id, 
      event_date: extractedEvent.event_date,
      confidence: extractedEvent.confidence,
      excerpt_length: extractedEvent.source_excerpt.length
    });

    // Validate extracted event
    if (!extractedEvent.event_date || !extractedEvent.source_excerpt) {
      throw new Error('Invalid extraction: missing required fields');
    }

    if (extractedEvent.source_excerpt.length > 500) {
      console.warn('[Timeline Agent v1] Excerpt too long, truncating', { 
        document_id,
        original_length: extractedEvent.source_excerpt.length 
      });
      extractedEvent.source_excerpt = extractedEvent.source_excerpt.substring(0, 497) + '...';
    }

    // Validate date format using our parser
    const parsedDate = parseSwedishDate(extractedEvent.source_excerpt);
    if (!parsedDate) {
      console.warn('[Timeline Agent v1] Could not parse date from excerpt', { 
        document_id,
        event_date: extractedEvent.event_date,
        excerpt: extractedEvent.source_excerpt.substring(0, 100)
      });
    }

    // Estimate page number from front matter (within first 5000 chars)
    // Find the excerpt position in the original content
    const excerptPosition = document.raw_content.indexOf(extractedEvent.source_excerpt);
    const estimatedPage = excerptPosition >= 0 
      ? estimatePageFromCharPosition(excerptPosition)
      : 1; // Default to page 1 if not found (front matter)

    // Insert timeline event
    const { data: insertedEvent, error: insertError } = await supabase
      .from('timeline_events')
      .insert({
        process_id,
        event_type: 'sou_published',
        event_date: extractedEvent.event_date,
        description: extractedEvent.description,
        source_page: estimatedPage,
        source_excerpt: extractedEvent.source_excerpt,
        source_url: document.pdf_url,
        actors: extractedEvent.actors || []
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to insert timeline event: ${insertError.message}`);
    }

    console.log('[Timeline Agent v1] ✅ Success: Event inserted', { 
      document_id,
      event_id: insertedEvent.id,
      event_date: extractedEvent.event_date,
      estimated_page: estimatedPage
    });

    // Update task status to completed
    if (task_id) {
      await supabase
        .from('agent_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          output_data: {
            success: true,
            event_id: insertedEvent.id,
            event_type: 'sou_published',
            event_date: extractedEvent.event_date,
            estimated_page: estimatedPage,
            confidence: extractedEvent.confidence
          }
        })
        .eq('id', task_id);
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        event_id: insertedEvent.id,
        event: insertedEvent
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[Timeline Agent v1] ❌ Error:', error);

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
