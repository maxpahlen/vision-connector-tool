/**
 * Scrape Directives from Riksdagen Open Data API
 * Phase 6.2 - Directives migration from regeringen.se to riksdagen.se
 * 
 * Target corpus: ~6,361 directives from 1988 onwards
 * 
 * Key difference from propositions: Directives include kommittébeteckning
 * for linking to SOUs produced by the same committee.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCorsPreflightRequest, createErrorResponse, createSuccessResponse } from "../_shared/http-utils.ts";

const RIKSDAGEN_API_BASE = "https://data.riksdagen.se";
const REQUEST_DELAY_MS = 500; // Validated for scale - prevents throttling

interface RiksdagenDocument {
  dok_id: string;
  titel: string;
  rm: string;           // Parliamentary session (e.g., "2024")
  organ: string;        // Responsible ministry
  datum: string;        // Publication date
  beteckning: string;   // Document designation (e.g., "10")
  undertitel?: string;
  doktyp: string;
}

interface RiksdagenListResponse {
  dokumentlista: {
    dokument?: RiksdagenDocument[];
    "@traffar": string;  // Total hits
    "@sidor": string;    // Total pages
    "@nasta_sida"?: string;
  };
}

interface DocumentStatus {
  dokumentstatus: {
    dokument: RiksdagenDocument;
    dokbilaga?: {
      bilaga?: Array<{
        fil_url?: string;
        filtyp?: string;
      }> | {
        fil_url?: string;
        filtyp?: string;
      };
    };
    dokreferens?: {
      referens?: Array<{
        referenstyp: string;
        ref_dok_typ: string;
        ref_dok_rm: string;
        ref_dok_bet: string;
        ref_dok_id: string;
      }> | {
        referenstyp: string;
        ref_dok_typ: string;
        ref_dok_rm: string;
        ref_dok_bet: string;
        ref_dok_id: string;
      };
    };
    dokuppgift?: {
      uppgift?: Array<{
        kod: string;
        text?: string;
      }> | {
        kod: string;
        text?: string;
      };
    };
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

const INITIAL_DELAY_MS = 1000;

function isUpstreamConnectionReset(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('Connection reset by peer') ||
    msg.includes('connection reset') ||
    msg.includes('client error (SendRequest)') ||
    msg.includes('error sending request')
  );
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

      // Exponential backoff: 3s, 6s, 12s, 24s
      const backoff = 3000 * Math.pow(2, attempt);
      console.log(`Retrying in ${backoff}ms...`);
      await delay(backoff);
    }
  }
  throw new Error("Max retries exceeded");
}

async function fetchDocumentList(session: string, page: number, pageSize: number): Promise<RiksdagenListResponse> {
  const url = `${RIKSDAGEN_API_BASE}/dokumentlista/?doktyp=dir&rm=${encodeURIComponent(session)}&utformat=json&sz=${pageSize}&p=${page}`;
  console.log(`Fetching list: ${url}`);
  const response = await fetchWithRetry(url);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to fetch document list: ${response.status}${body ? ` - ${body.slice(0, 200)}` : ''}`);
  }
  return await response.json();
}

async function fetchDocumentStatus(dokId: string): Promise<DocumentStatus> {
  const url = `${RIKSDAGEN_API_BASE}/dokumentstatus/${dokId}.json`;
  console.log(`Fetching status: ${url}`);
  const response = await fetchWithRetry(url);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to fetch document status: ${response.status}${body ? ` - ${body.slice(0, 200)}` : ''}`);
  }
  return await response.json();
}

// Normalize array fields - API returns single object when one item, array when multiple
function normalizeArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function extractPdfUrl(status: DocumentStatus): string | null {
  const bilagor = normalizeArray(status.dokumentstatus.dokbilaga?.bilaga);
  const pdfBilaga = bilagor.find(b => b.filtyp?.toLowerCase() === "pdf");
  return pdfBilaga?.fil_url || null;
}

function extractKommittebeteckning(status: DocumentStatus): string | null {
  // Extract committee designation from dokuppgift
  const uppgifter = normalizeArray(status.dokumentstatus.dokuppgift?.uppgift);
  const kommitte = uppgifter.find(u => u.kod === "kommittebeteckning");
  return kommitte?.text || null;
}

function extractCrossReferences(status: DocumentStatus): Array<{ docNumber: string; refDokId: string; refType: string; targetDocType: string }> {
  const refs = normalizeArray(status.dokumentstatus.dokreferens?.referens);
  return refs.map(r => ({
    docNumber: formatDocNumber(r.ref_dok_typ, r.ref_dok_rm, r.ref_dok_bet),
    refDokId: r.ref_dok_id,
    refType: r.referenstyp,
    targetDocType: r.ref_dok_typ
  }));
}

function formatDocNumber(docType: string, session: string, designation: string): string {
  const typeMap: Record<string, string> = {
    'prop': 'Prop.',
    'bet': 'Bet.',
    'mot': 'Mot.',
    'sou': 'SOU',
    'dir': 'Dir.',
    'sfs': 'SFS'
  };
  const prefix = typeMap[docType] || docType.toUpperCase();
  return `${prefix} ${session}:${designation}`;
}

function mapReferenceType(riksdagenRefType: string, targetDocType: string): string {
  // Map Riksdagen reference types to our schema
  if (riksdagenRefType === "behandlar") return "recommends";
  if (riksdagenRefType === "besvarar") return "responds_to";
  if (riksdagenRefType === "hänvisar") return "cites";
  if (targetDocType === "sou") return "produces_sou";
  if (targetDocType === "prop") return "results_in_proposition";
  return "references";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsPreflightRequest();
  }

  try {
    const { session = "2024", limit = 10, page = 1 } = await req.json().catch(() => ({}));
    
    console.log(`Scraping directives for session ${session}, limit ${limit}, page ${page}`);

    console.log(`Waiting ${INITIAL_DELAY_MS}ms before first request...`);
    await delay(INITIAL_DELAY_MS);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch list from Riksdagen API
    const listResponse = await fetchDocumentList(session, page, Math.min(limit, 100));
    const documents = listResponse.dokumentlista.dokument || [];
    
    console.log(`Found ${documents.length} documents, total ${listResponse.dokumentlista["@traffar"]}`);

    const results = {
      processed: 0,
      inserted: 0,
      skipped: 0,
      refsCreated: 0,
      kommitteLinksFound: 0,
      errors: [] as string[]
    };

    for (const doc of documents.slice(0, limit)) {
      try {
        await delay(REQUEST_DELAY_MS);
        
        // Format doc_number: "Dir. 2024:10"
        const docNumber = `Dir. ${doc.rm}:${doc.beteckning}`;
        
        // Check if already exists
        const { data: existing } = await supabase
          .from("documents")
          .select("id")
          .eq("doc_number", docNumber)
          .eq("doc_type", "directive")
          .maybeSingle();

        if (existing) {
          console.log(`Skipping existing: ${docNumber}`);
          results.skipped++;
          results.processed++;
          continue;
        }

        // Fetch detailed status
        const status = await fetchDocumentStatus(doc.dok_id);
        
        const pdfUrl = extractPdfUrl(status);
        const crossRefs = extractCrossReferences(status);
        const kommittebeteckning = extractKommittebeteckning(status);
        
        if (kommittebeteckning) {
          results.kommitteLinksFound++;
        }

        // Insert document
        const { data: insertedDoc, error: insertError } = await supabase
          .from("documents")
          .insert({
            doc_type: "directive",
            doc_number: docNumber,
            title: doc.titel,
            publication_date: doc.datum || null,
            pdf_url: pdfUrl,
            lifecycle_stage: "directive",
            ministry: doc.organ || null,
            url: `https://www.riksdagen.se/sv/dokument-och-lagar/dokument/kommittedirektiv/${doc.dok_id}/`,
            metadata: {
              riksdagen_id: doc.dok_id,
              session: doc.rm,
              designation: doc.beteckning,
              source: "riksdagen",
              subtitle: doc.undertitel || null,
              kommittebeteckning: kommittebeteckning,
              cross_refs: crossRefs.map(r => ({ type: r.refType, target: r.docNumber }))
            }
          })
          .select("id")
          .single();

        if (insertError) {
          throw new Error(`Insert failed: ${insertError.message}`);
        }

        results.inserted++;

        // Create document references for cross-links
        for (const ref of crossRefs) {
          const { error: refError } = await supabase
            .from("document_references")
            .insert({
              source_document_id: insertedDoc.id,
              target_doc_number: ref.docNumber,
              reference_type: mapReferenceType(ref.refType, ref.targetDocType),
              confidence: "high"
            });

          if (!refError) {
            results.refsCreated++;
          }
        }

        results.processed++;
        console.log(`Processed: ${docNumber}${kommittebeteckning ? ` (${kommittebeteckning})` : ''}`);

      } catch (docError) {
        const msg = docError instanceof Error ? docError.message : String(docError);
        console.error(`Error processing ${doc.dok_id}: ${msg}`);
        results.errors.push(`${doc.dok_id}: ${msg}`);
        results.processed++;
      }
    }

    return createSuccessResponse({
      session,
      totalAvailable: parseInt(listResponse.dokumentlista["@traffar"]),
      totalPages: parseInt(listResponse.dokumentlista["@sidor"]),
      currentPage: page,
      ...results
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Scraper error:", msg);
    if (isUpstreamConnectionReset(error)) {
      return createErrorResponse("upstream_unavailable", msg, 503);
    }
    return createErrorResponse("scraper_error", msg, 500);
  }
});
