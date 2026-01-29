/**
 * Scrape Propositions from Riksdagen Open Data API
 * Phase 6.1 - Propositions migration from regeringen.se to riksdagen.se
 * 
 * Target corpus: ~31,598 propositions from 1971 onwards
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCorsPreflightRequest, createErrorResponse, createSuccessResponse } from "../_shared/http-utils.ts";

const RIKSDAGEN_API_BASE = "https://data.riksdagen.se";
const REQUEST_DELAY_MS = 500; // Validated for scale - prevents throttling

interface RiksdagenDocument {
  dok_id: string;
  titel: string;
  rm: string;           // Parliamentary session (e.g., "2024/25")
  organ: string;        // Responsible ministry/committee
  datum: string;        // Publication date
  beteckning: string;   // Document designation (e.g., "1")
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
    dokaktivitet?: {
      aktivitet?: Array<{
        kod: string;
        namn: string;
        datum: string;
      }> | {
        kod: string;
        namn: string;
        datum: string;
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
  const url = `${RIKSDAGEN_API_BASE}/dokumentlista/?doktyp=prop&rm=${encodeURIComponent(session)}&utformat=json&sz=${pageSize}&p=${page}`;
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

function extractTimelineEvents(status: DocumentStatus): Array<{ type: string; date: string; description: string }> {
  const activities = normalizeArray(status.dokumentstatus.dokaktivitet?.aktivitet);
  const events: Array<{ type: string; date: string; description: string }> = [];
  
  const hasDecision = activities.some(a => a.kod === "BES");
  
  for (const activity of activities) {
    if (activity.kod === "BES") {
      events.push({
        type: "parliament_decision",
        date: activity.datum,
        description: activity.namn || "Riksdagsbeslut"
      });
    } else if (activity.kod === "AVG" && !hasDecision) {
      events.push({
        type: "parliament_vote",
        date: activity.datum,
        description: activity.namn || "Omröstning"
      });
    } else if (activity.kod === "UTL") {
      events.push({
        type: "committee_referral",
        date: activity.datum,
        description: activity.namn || "Utskottsbehandling"
      });
    }
  }
  
  return events;
}

function mapReferenceType(riksdagenRefType: string, targetDocType: string): string {
  // Map Riksdagen reference types to our schema
  if (riksdagenRefType === "behandlar") return "recommends";
  if (riksdagenRefType === "besvarar") return "responds_to";
  if (riksdagenRefType === "hänvisar") return "cites";
  if (targetDocType === "bet") return "has_committee_report";
  if (targetDocType === "sfs") return "results_in_law";
  return "references";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsPreflightRequest();
  }

  try {
    const { session = "2024/25", limit = 10, page = 1 } = await req.json().catch(() => ({}));
    
    console.log(`Scraping propositions for session ${session}, limit ${limit}, page ${page}`);

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
      eventsCreated: 0,
      errors: [] as string[]
    };

    for (const doc of documents.slice(0, limit)) {
      try {
        await delay(REQUEST_DELAY_MS);
        
        // Format doc_number: "Prop. 2024/25:1"
        const docNumber = `Prop. ${doc.rm}:${doc.beteckning}`;
        
        // Check if already exists
        const { data: existing } = await supabase
          .from("documents")
          .select("id")
          .eq("doc_number", docNumber)
          .eq("doc_type", "proposition")
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
        const timelineEvents = extractTimelineEvents(status);

        // Insert document
        const { data: insertedDoc, error: insertError } = await supabase
          .from("documents")
          .insert({
            doc_type: "proposition",
            doc_number: docNumber,
            title: doc.titel,
            publication_date: doc.datum || null,
            pdf_url: pdfUrl,
            lifecycle_stage: "proposition",
            ministry: doc.organ || null,
            url: `https://www.riksdagen.se/sv/dokument-och-lagar/dokument/proposition/${doc.dok_id}/`,
            metadata: {
              riksdagen_id: doc.dok_id,
              session: doc.rm,
              designation: doc.beteckning,
              source: "riksdagen",
              subtitle: doc.undertitel || null,
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

        // Create timeline events
        if (timelineEvents.length > 0) {
          const processKey = `prop-${doc.dok_id}`;
          const { data: existingProcess } = await supabase
            .from("processes")
            .select("id")
            .eq("process_key", processKey)
            .maybeSingle();

          let processId = existingProcess?.id;
          
          if (!processId) {
            const { data: newProcess, error: processError } = await supabase
              .from("processes")
              .insert({
                process_key: processKey,
                title: doc.titel,
                current_stage: "government",
                main_document_id: insertedDoc.id,
                ministry: doc.organ || null
              })
              .select("id")
              .single();

            if (!processError) {
              processId = newProcess.id;
            }
          }

          if (processId) {
            for (const event of timelineEvents) {
              const { error: eventError } = await supabase
                .from("timeline_events")
                .insert({
                  process_id: processId,
                  event_type: event.type,
                  event_date: event.date,
                  description: event.description,
                  source_url: `https://www.riksdagen.se/sv/dokument-och-lagar/dokument/proposition/${doc.dok_id}/`
                });

              if (!eventError) {
                results.eventsCreated++;
              }
            }
          }
        }

        results.processed++;
        console.log(`Processed: ${docNumber}`);

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
