/**
 * Process Directive Text from Riksdagen API
 * Phase 1.2 - Fetches HTML-formatted text from Riksdagen .text endpoint
 * for directives that lack pdf_url (riksdagen-sourced)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCorsPreflightRequest, createErrorResponse, createSuccessResponse } from "../_shared/http-utils.ts";
import { sanitizeText } from "../_shared/text-utils.ts";

const RIKSDAGEN_API_BASE = "https://data.riksdagen.se";
const REQUEST_DELAY_MS = 500;
const INITIAL_DELAY_MS = 1000;

const FETCH_HEADERS = {
  'User-Agent': 'LagstiftningsBevakning/1.0 (https://lovable.dev; contact@lovable.dev)',
  'Accept': 'text/plain, text/html, */*',
  'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8',
  'Connection': 'keep-alive',
};

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, retries = 5): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      if (attempt > 0) {
        const jitter = Math.random() * 500;
        await delay(jitter);
      }
      const response = await fetch(url, { headers: FETCH_HEADERS });
      if (response.status === 429 || response.status === 503) {
        const backoff = Math.pow(2, attempt) * 2000;
        console.log(`Rate limited, backing off ${backoff}ms`);
        await delay(backoff);
        continue;
      }
      return response;
    } catch (error) {
      console.error(`Fetch attempt ${attempt + 1}/${retries} failed:`, error);
      if (attempt === retries - 1) throw error;
      const backoff = 3000 * Math.pow(2, attempt);
      console.log(`Retrying in ${backoff}ms...`);
      await delay(backoff);
    }
  }
  throw new Error("Max retries exceeded");
}

/**
 * Strip HTML tags from text, preserving content.
 * Converts <br>, <p>, <div> closings to newlines for readability.
 */
function stripHtmlTags(html: string): string {
  let text = html;
  // Convert block-level closing tags and <br> to newlines
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/(?:p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n');
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]*>/g, '');
  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  return text;
}

interface DirectiveDoc {
  id: string;
  doc_number: string;
  metadata: { riksdagen_id?: string; dok_id?: string; source?: string } | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsPreflightRequest();
  }

  try {
    const { limit = 10, dry_run = false, document_id } = await req.json().catch(() => ({}));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build query for riksdagen directives missing raw_content
    let query = supabase
      .from("documents")
      .select("id, doc_number, metadata")
      .eq("doc_type", "directive")
      .is("raw_content", null);

    if (document_id) {
      query = query.eq("id", document_id);
    } else {
      query = query.limit(limit);
    }

    const { data: directives, error: fetchError } = await query;

    if (fetchError) throw new Error(`Fetch failed: ${fetchError.message}`);
    if (!directives || directives.length === 0) {
      return createSuccessResponse({ processed: 0, updated: 0, skipped: 0, errors: [], message: "No directives with missing text found" });
    }

    // Filter to riksdagen-sourced only (in code, since PostgREST JSONB filtering can be unreliable)
    const riksdagenDirectives = (directives as DirectiveDoc[]).filter(
      d => d.metadata?.source === 'riksdagen'
    );

    if (riksdagenDirectives.length === 0) {
      return createSuccessResponse({ processed: 0, updated: 0, skipped: 0, errors: [], message: "No riksdagen directives with missing text found" });
    }

    console.log(`Processing ${riksdagenDirectives.length} riksdagen directives (dry_run=${dry_run})`);

    // Initial delay to stabilize connection
    await delay(INITIAL_DELAY_MS);

    const results = { processed: 0, updated: 0, skipped: 0, errors: [] as string[], details: [] as Record<string, unknown>[] };

    for (const directive of riksdagenDirectives) {
      try {
        await delay(REQUEST_DELAY_MS);

        const riksdagenId = directive.metadata?.riksdagen_id || directive.metadata?.dok_id;
        if (!riksdagenId) {
          results.errors.push(`${directive.doc_number}: missing riksdagen_id/dok_id in metadata`);
          results.skipped++;
          results.processed++;
          continue;
        }

        // Use .text (dot, not slash) per confirmed API format
        const url = `${RIKSDAGEN_API_BASE}/dokument/${riksdagenId}.text`;
        console.log(`Fetching text: ${url}`);

        const response = await fetchWithRetry(url);

        if (!response.ok) {
          console.log(`No text available for ${directive.doc_number} (status ${response.status})`);
          await response.text().catch(() => {}); // consume body
          results.errors.push(`${directive.doc_number}: HTTP ${response.status}`);
          results.skipped++;
          results.processed++;
          continue;
        }

        const rawHtml = await response.text();

        // Guard: skip redirect pages
        if (rawHtml.startsWith('<!DOCTYPE') || rawHtml.startsWith('<html')) {
          console.log(`Skipping redirect page for ${directive.doc_number}`);
          results.errors.push(`${directive.doc_number}: redirect page detected`);
          results.skipped++;
          results.processed++;
          continue;
        }

        // Strip HTML tags then sanitize
        const strippedText = stripHtmlTags(rawHtml);
        const cleanText = sanitizeText(strippedText);

        // Guard: skip if too short after cleaning
        if (cleanText.length < 50) {
          console.log(`Skipping short text for ${directive.doc_number} (${cleanText.length} chars)`);
          results.errors.push(`${directive.doc_number}: text too short (${cleanText.length} chars)`);
          results.skipped++;
          results.processed++;
          continue;
        }

        results.details.push({
          doc_number: directive.doc_number,
          riksdagen_id: riksdagenId,
          text_length: cleanText.length,
          dry_run,
        });

        if (!dry_run) {
          const { error: updateError } = await supabase
            .from("documents")
            .update({
              raw_content: cleanText,
              processed_at: new Date().toISOString(),
              metadata: {
                ...directive.metadata,
                text_extraction: {
                  method: 'riksdagen_text_endpoint',
                  extracted_at: new Date().toISOString(),
                  character_count: cleanText.length,
                  status: 'ok',
                },
              },
            })
            .eq("id", directive.id);

          if (updateError) {
            results.errors.push(`${directive.doc_number}: update failed - ${updateError.message}`);
          } else {
            results.updated++;
            console.log(`Updated text for ${directive.doc_number} (${cleanText.length} chars)`);
          }
        } else {
          results.updated++;
          console.log(`[DRY RUN] Would update ${directive.doc_number} (${cleanText.length} chars)`);
        }

        results.processed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.errors.push(`${directive.doc_number}: ${msg}`);
        results.processed++;
      }
    }

    return createSuccessResponse({ dry_run, ...results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Process directive text error:", msg);
    return createErrorResponse("processing_error", msg, 500);
  }
});
