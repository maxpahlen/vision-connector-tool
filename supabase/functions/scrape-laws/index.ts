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

async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.status === 429 || response.status === 503) {
        const backoff = Math.pow(2, attempt) * 1000;
        console.log(`Rate limited, backing off ${backoff}ms`);
        await delay(backoff);
        continue;
      }
      return response;
    } catch (error) {
      if (attempt === retries - 1) throw error;
      await delay(1000);
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
    const response = await fetchWithRetry(url);
    if (!response.ok) {
      console.log(`No text available for ${dokId}`);
      return null;
    }
    return await response.text();
  } catch (error) {
    console.log(`Failed to fetch text for ${dokId}:`, error);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsPreflightRequest();
  }

  try {
    const { year = "2024", limit = 10, page = 1, fetchText = true } = await req.json().catch(() => ({}));
    
    console.log(`Scraping laws for year ${year}, limit ${limit}, page ${page}, fetchText ${fetchText}`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

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
