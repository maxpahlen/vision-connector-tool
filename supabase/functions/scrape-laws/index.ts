/**
 * Scrape Laws (SFS) from Riksdagen Open Data API
 * Phase 5.4.2 - Law stage document ingestion
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCorsPreflightRequest, createErrorResponse, createSuccessResponse } from "../_shared/http-utils.ts";

const RIKSDAGEN_API_BASE = "https://data.riksdagen.se";
const REQUEST_DELAY_MS = 500;

interface RiksdagenSFSDocument {
  dok_id: string;
  titel: string;
  rm: string;
  organ: string;
  datum: string;
  beteckning: string;
  text?: string;
  dokument_url_text?: string;
}

interface RiksdagenListResponse {
  dokumentlista: {
    dokument?: RiksdagenSFSDocument[];
    "@traffar": string;
    "@sidor": string;
    "@nasta_sida"?: string;
  };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const FETCH_HEADERS = {
  'User-Agent': 'LagstiftningsBevakning/1.0 (https://lovable.dev; contact@lovable.dev)',
  'Accept': 'application/json',
  'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8',
  'Connection': 'keep-alive',
};

const INITIAL_DELAY_MS = 1000; // Delay before first request to let connection stabilize

async function fetchWithRetry(url: string, retries = 5): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Add jitter to avoid thundering herd
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
      // Exponential backoff: 3s, 6s, 12s, 24s
      const backoff = 3000 * Math.pow(2, attempt);
      console.log(`Retrying in ${backoff}ms...`);
      await delay(backoff);
    }
  }
  throw new Error("Max retries exceeded");
}

async function fetchDocumentList(year: string, page: number, pageSize: number): Promise<RiksdagenListResponse> {
  const url = `${RIKSDAGEN_API_BASE}/dokumentlista/?doktyp=sfs&rm=${encodeURIComponent(year)}&utformat=json&sz=${pageSize}&p=${page}`;
  console.log(`Fetching list: ${url}`);
  const response = await fetchWithRetry(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch document list: ${response.status}`);
  }
  return await response.json();
}

async function fetchDocumentText(dokId: string): Promise<string | null> {
  try {
    const url = `${RIKSDAGEN_API_BASE}/dokument/${dokId}.text`;
    console.log(`Fetching text: ${url}`);
    
    // Text endpoint needs different Accept header
    const textHeaders = {
      ...FETCH_HEADERS,
      'Accept': 'text/plain, text/html, */*',
    };
    
    const response = await fetch(url, { headers: textHeaders });
    console.log(`Text response for ${dokId}: status=${response.status}, content-type=${response.headers.get('content-type')}`);
    
    if (!response.ok) {
      console.log(`No text available for ${dokId} (status ${response.status})`);
      // Consume body to avoid resource leaks
      await response.text().catch(() => {});
      return null;
    }
    
    const text = await response.text();
    // Skip if response is HTML (redirect page) or too short
    if (text.startsWith('<!DOCTYPE') || text.startsWith('<html') || text.length < 50) {
      console.log(`Skipping HTML/empty response for ${dokId}`);
      return null;
    }
    
    return text;
  } catch (error) {
    console.log(`Failed to fetch text for ${dokId}:`, error);
    return null;
  }
}

interface LawDoc {
  id: string;
  doc_number: string;
  metadata: { dok_id?: string } | null;
}

// deno-lint-ignore no-explicit-any
async function handleBackfill(supabase: any, limit: number) {
  // Find laws with missing text
  const { data: laws, error: fetchError } = await supabase
    .from("documents")
    .select("id, doc_number, metadata")
    .eq("doc_type", "law")
    .is("raw_content", null)
    .limit(limit);

  if (fetchError) throw new Error(`Fetch failed: ${fetchError.message}`);
  if (!laws || laws.length === 0) {
    return { processed: 0, updated: 0, errors: [], message: "No laws with missing text found" };
  }

  const results = { processed: 0, updated: 0, errors: [] as string[] };

  for (const law of laws as LawDoc[]) {
    try {
      await delay(REQUEST_DELAY_MS);
      const dokId = law.metadata?.dok_id;
      if (!dokId) {
        results.errors.push(`${law.doc_number}: missing dok_id in metadata`);
        results.processed++;
        continue;
      }

      const text = await fetchDocumentText(dokId);
      if (!text) {
        results.errors.push(`${law.doc_number}: no text available`);
        results.processed++;
        continue;
      }

      const { error: updateError } = await supabase
        .from("documents")
        .update({ raw_content: text })
        .eq("id", law.id);

      if (updateError) {
        results.errors.push(`${law.doc_number}: update failed - ${updateError.message}`);
      } else {
        results.updated++;
        console.log(`Updated text for ${law.doc_number}`);
      }
      results.processed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.errors.push(`${law.doc_number}: ${msg}`);
      results.processed++;
    }
  }

  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsPreflightRequest();
  }

  try {
    const { year = "2024", limit = 10, page = 1, fetchText = true, backfill = false } = await req.json().catch(() => ({}));
    
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Backfill mode: re-fetch text for existing laws with null raw_content
    if (backfill) {
      console.log(`Backfilling text for up to ${limit} laws...`);
      await delay(INITIAL_DELAY_MS);
      const results = await handleBackfill(supabase, limit);
      return createSuccessResponse({ backfill: true, ...results });
    }

    console.log(`Scraping laws for year ${year}, limit ${limit}, page ${page}, fetchText ${fetchText}`);

    // Initial delay to let edge function connection stabilize
    console.log(`Waiting ${INITIAL_DELAY_MS}ms before first request...`);
    await delay(INITIAL_DELAY_MS);

    // Fetch list from Riksdagen API
    const listResponse = await fetchDocumentList(year, page, Math.min(limit, 100));
    const documents = listResponse.dokumentlista.dokument || [];
    
    console.log(`Found ${documents.length} documents, total ${listResponse.dokumentlista["@traffar"]}`);

    const results = {
      processed: 0,
      inserted: 0,
      skipped: 0,
      textExtracted: 0,
      errors: [] as string[]
    };

    for (const doc of documents.slice(0, limit)) {
      try {
        await delay(REQUEST_DELAY_MS);
        
        // Use beteckning as doc_number (e.g., "2024:1000")
        const docNumber = doc.beteckning;
        
        // Check if already exists
        const { data: existing } = await supabase
          .from("documents")
          .select("id")
          .eq("doc_number", docNumber)
          .eq("doc_type", "law")
          .maybeSingle();

        if (existing) {
          console.log(`Skipping existing: ${docNumber}`);
          results.skipped++;
          results.processed++;
          continue;
        }

        // Fetch text content if requested
        let textContent: string | null = null;
        if (fetchText) {
          // Try embedded text first, then .text endpoint
          textContent = doc.text || null;
          if (!textContent) {
            textContent = await fetchDocumentText(doc.dok_id);
          }
          if (textContent) {
            results.textExtracted++;
          }
        }

        // Insert document
        const { error: insertError } = await supabase
          .from("documents")
          .insert({
            doc_type: "law",
            doc_number: docNumber,
            title: doc.titel,
            publication_date: doc.datum || null,
            pdf_url: null, // SFS typically don't have PDFs in API
            lifecycle_stage: "law",
            ministry: doc.organ || null,
            url: `https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/${doc.dok_id}/`,
            raw_content: textContent,
            metadata: {
              sfs_number: docNumber,
              dok_id: doc.dok_id,
              year: year,
              organ: doc.organ
            }
          });

        if (insertError) {
          throw new Error(`Insert failed: ${insertError.message}`);
        }

        results.inserted++;
        results.processed++;
        console.log(`Processed: ${docNumber}`);

      } catch (docError) {
        const msg = docError instanceof Error ? docError.message : String(docError);
        console.error(`Error processing ${doc.beteckning}: ${msg}`);
        results.errors.push(`${doc.beteckning}: ${msg}`);
        results.processed++;
      }
    }

    return createSuccessResponse({
      year,
      totalAvailable: parseInt(listResponse.dokumentlista["@traffar"]),
      totalPages: parseInt(listResponse.dokumentlista["@sidor"]),
      currentPage: page,
      ...results
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Scraper error:", msg);
    return createErrorResponse("scraper_error", msg, 500);
  }
});
