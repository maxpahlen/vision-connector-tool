/**
 * Scrape Committee Reports (Betänkanden) from Riksdagen Open Data API
 * Phase 5.4.1 - Parliament stage document ingestion
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCorsPreflightRequest, createErrorResponse, createSuccessResponse } from "../_shared/http-utils.ts";

const RIKSDAGEN_API_BASE = "https://data.riksdagen.se";
const REQUEST_DELAY_MS = 500;

interface RiksdagenDocument {
  dok_id: string;
  titel: string;
  rm: string;
  organ: string;
  datum: string;
  beteckning: string;
}

interface RiksdagenListResponse {
  dokumentlista: {
    dokument?: RiksdagenDocument[];
    "@traffar": string;
    "@sidor": string;
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
      }>;
    };
    dokreferens?: {
      referens?: Array<{
        referenstyp: string;
        ref_dok_typ: string;
        ref_dok_rm: string;
        ref_dok_bet: string;
        ref_dok_id: string;
      }>;
    };
    dokaktivitet?: {
      aktivitet?: Array<{
        kod: string;
        namn: string;
        datum: string;
      }>;
    };
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

async function fetchDocumentList(session: string, page: number, pageSize: number): Promise<RiksdagenListResponse> {
  const url = `${RIKSDAGEN_API_BASE}/dokumentlista/?doktyp=bet&rm=${encodeURIComponent(session)}&utformat=json&sz=${pageSize}&p=${page}`;
  console.log(`Fetching list: ${url}`);
  const response = await fetchWithRetry(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch document list: ${response.status}`);
  }
  return await response.json();
}

async function fetchDocumentStatus(dokId: string): Promise<DocumentStatus> {
  const url = `${RIKSDAGEN_API_BASE}/dokumentstatus/${dokId}.json`;
  console.log(`Fetching status: ${url}`);
  const response = await fetchWithRetry(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch document status: ${response.status}`);
  }
  return await response.json();
}

function extractPdfUrl(status: DocumentStatus): string | null {
  const bilagor = status.dokumentstatus.dokbilaga?.bilaga || [];
  const pdfBilaga = bilagor.find(b => b.filtyp?.toLowerCase() === "pdf");
  return pdfBilaga?.fil_url || null;
}

function extractPropositionRefs(status: DocumentStatus): Array<{ docNumber: string; refDokId: string }> {
  const refs = status.dokumentstatus.dokreferens?.referens || [];
  return refs
    .filter(r => r.referenstyp === "behandlar" && r.ref_dok_typ === "prop")
    .map(r => ({
      docNumber: `Prop. ${r.ref_dok_rm}:${r.ref_dok_bet}`,
      refDokId: r.ref_dok_id
    }));
}

function extractTimelineEvents(status: DocumentStatus): Array<{ type: string; date: string; description: string }> {
  const activities = status.dokumentstatus.dokaktivitet?.aktivitet || [];
  const events: Array<{ type: string; date: string; description: string }> = [];
  
  for (const activity of activities) {
    if (activity.kod === "BES") {
      events.push({
        type: "parliament_decision",
        date: activity.datum,
        description: activity.namn || "Riksdagsbeslut"
      });
    } else if (activity.kod === "AVG" && !activities.some(a => a.kod === "BES")) {
      // Only add AVG if no BES exists (they often overlap)
      events.push({
        type: "parliament_vote",
        date: activity.datum,
        description: activity.namn || "Omröstning"
      });
    }
  }
  
  return events;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsPreflightRequest();
  }

  try {
    const { session = "2024/25", limit = 10, page = 1 } = await req.json().catch(() => ({}));
    
    console.log(`Scraping committee reports for session ${session}, limit ${limit}, page ${page}`);

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
        
        // Check if already exists
        const { data: existing } = await supabase
          .from("documents")
          .select("id")
          .eq("doc_number", doc.dok_id)
          .eq("doc_type", "committee_report")
          .maybeSingle();

        if (existing) {
          console.log(`Skipping existing: ${doc.dok_id}`);
          results.skipped++;
          results.processed++;
          continue;
        }

        // Fetch detailed status
        const status = await fetchDocumentStatus(doc.dok_id);
        
        const pdfUrl = extractPdfUrl(status);
        const propRefs = extractPropositionRefs(status);
        const timelineEvents = extractTimelineEvents(status);

        // Insert document
        const { data: insertedDoc, error: insertError } = await supabase
          .from("documents")
          .insert({
            doc_type: "committee_report",
            doc_number: doc.dok_id,
            title: doc.titel,
            publication_date: doc.datum || null,
            pdf_url: pdfUrl,
            lifecycle_stage: "parliament",
            ministry: null,
            url: `https://www.riksdagen.se/sv/dokument-och-lagar/dokument/${doc.dok_id}/`,
            metadata: {
              riksmote: doc.rm,
              committee: doc.organ,
              beteckning: doc.beteckning,
              proposition_refs: propRefs.map(r => r.docNumber)
            }
          })
          .select("id")
          .single();

        if (insertError) {
          throw new Error(`Insert failed: ${insertError.message}`);
        }

        results.inserted++;

        // Create document references for proposition links
        for (const ref of propRefs) {
          const { error: refError } = await supabase
            .from("document_references")
            .insert({
              source_document_id: insertedDoc.id,
              target_doc_number: ref.docNumber,
              reference_type: "recommends",
              confidence: "high"
            });

          if (!refError) {
            results.refsCreated++;
          }
        }

        // Create timeline events - need process first
        if (timelineEvents.length > 0) {
          // Find or create process for this betänkande
          const processKey = `bet-${doc.dok_id}`;
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
                current_stage: "parliament",
                main_document_id: insertedDoc.id
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
                  source_url: `https://www.riksdagen.se/sv/dokument-och-lagar/dokument/${doc.dok_id}/`
                });

              if (!eventError) {
                results.eventsCreated++;
              }
            }
          }
        }

        results.processed++;
        console.log(`Processed: ${doc.dok_id}`);

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
    return createErrorResponse("scraper_error", msg, 500);
  }
});
