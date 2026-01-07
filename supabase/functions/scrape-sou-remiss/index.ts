import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DOMParser, Element } from 'https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts';
import { 
  parseRemissPage, 
  classifyFileType, 
  extractOrganization,
  type RemissPageResult,
  type RemissvarDocument 
} from '../_shared/remiss-parser.ts';

/**
 * Phase 5.3: Remiss Scraper for SOU Documents (Fixed Strategy)
 * 
 * Two-phase resolution strategy:
 * 1. Phase A: Check document_references for existing remiss links
 * 2. Phase B: Scrape SOU page for specific remiss links (not generic index)
 * 
 * Critical: Must NOT match generic /remisser/ index page
 * 
 * NOTE: Parsing logic moved to _shared/remiss-parser.ts for reuse.
 * This function now imports parseRemissPage, classifyFileType, extractOrganization.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type DiscoveryMethod = 'lagstiftningskedja' | 'index_match' | 'page_scrape' | 'manual' | 'not_found';

/**
 * Validate that a remiss URL is specific (not the generic index page)
 * Valid: /remisser/2024/01/remiss-av-betankandet-...
 * Invalid: /remisser/ or /remisser
 */
function isValidRemissUrl(url: string): boolean {
  // Must have date path like /remisser/YYYY/MM/
  const datePathPattern = /\/remisser\/\d{4}\/\d{2}\//;
  return datePathPattern.test(url);
}

/**
 * Phase A: Try to find remiss URL from document_references table
 * Now uses the target_url column for direct URL lookup
 */
async function findRemissFromReferences(
  supabase: any,
  documentId: string
): Promise<{ url: string; method: DiscoveryMethod } | null> {
  // Primary lookup: Check target_url column for remiss URLs directly
  const { data: urlRefs, error: urlError } = await supabase
    .from('document_references')
    .select('target_url, target_doc_number, source_excerpt')
    .eq('source_document_id', documentId)
    .like('target_url', '%/remisser/%');

  if (!urlError && urlRefs && urlRefs.length > 0) {
    // Check each reference for a valid remiss URL
    for (const ref of urlRefs as Array<{ target_url: string | null; target_doc_number: string | null; source_excerpt: string | null }>) {
      if (ref.target_url && isValidRemissUrl(ref.target_url)) {
        console.log(`Phase A: Found remiss via target_url: ${ref.target_url}`);
        return { url: ref.target_url, method: 'lagstiftningskedja' as DiscoveryMethod };
      }
    }
  }

  // Fallback: Look for references where target_doc_number contains "remiss"
  const { data: textRefs, error: textError } = await supabase
    .from('document_references')
    .select('target_doc_number, source_excerpt, target_url')
    .eq('source_document_id', documentId)
    .ilike('target_doc_number', '%remiss%');

  if (textError || !textRefs || textRefs.length === 0) {
    return null;
  }

  // Try to extract a URL from the references
  for (const ref of textRefs as Array<{ target_doc_number: string | null; source_excerpt: string | null; target_url: string | null }>) {
    if (ref.target_url && isValidRemissUrl(ref.target_url)) {
      console.log(`Phase A: Found remiss via target_url (fallback): ${ref.target_url}`);
      return { url: ref.target_url, method: 'lagstiftningskedja' as DiscoveryMethod };
    }
    
    const text = ref.target_doc_number || '';
    console.log(`Phase A: Found remiss reference mentioning: ${text.substring(0, 100)}`);
    
    // If source_excerpt contains a URL (legacy data)
    const urlMatch = (ref.source_excerpt || '').match(/https?:\/\/[^\s"'<>]+remisser\/\d{4}\/\d{2}\/[^\s"'<>]+/);
    if (urlMatch && isValidRemissUrl(urlMatch[0])) {
      return { url: urlMatch[0], method: 'lagstiftningskedja' as DiscoveryMethod };
    }
  }

  return null;
}

/**
 * Phase B: Scrape SOU page for specific remiss link
 * Only accepts URLs with date paths, rejects generic /remisser/ page
 */
function findRemissLinkFromPage(html: string, baseUrl: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) return null;

  // Only search within the main content area
  const mainContent = doc.querySelector('main#content, .l-main, article');
  const searchArea = mainContent || doc.body;
  if (!searchArea) return null;

  // Look specifically in Lagstiftningskedja or Genvägar sections
  const shortcutSections = searchArea.querySelectorAll(
    '.publication-shortcuts, .shortcuts, [class*="genvag"], [class*="shortcut"], .related-links'
  );

  const candidateLinks: Array<{ url: string; score: number; text: string }> = [];

  // Helper to process links
  const processLink = (link: Element, sectionBonus: number) => {
    const href = link.getAttribute('href');
    if (!href) return;

    const text = link.textContent?.toLowerCase() || '';
    const fullUrl = href.startsWith('http') ? href : `https://www.regeringen.se${href}`;

    // Skip remissvar/svar links
    if (text.includes('remissvar') || text.includes('svar på remiss')) return;

    // Must contain "remiss" somewhere
    if (!text.includes('remiss') && !fullUrl.includes('/remisser/')) return;

    // Critical: Must be a specific remiss page, not the index
    if (!isValidRemissUrl(fullUrl)) {
      console.log(`Rejecting generic remiss URL: ${fullUrl}`);
      return;
    }

    // Score the link
    let score = sectionBonus;
    if (text.includes('remiss av')) score += 3;
    if (text.includes('betänkandet')) score += 2;
    if (text.startsWith('remiss')) score += 1;

    candidateLinks.push({ url: fullUrl, score, text: text.substring(0, 50) });
  };

  // First, search in shortcut sections (higher priority)
  for (const section of shortcutSections) {
    const links = (section as Element).querySelectorAll('a[href*="/remiss"]');
    for (const link of links) {
      processLink(link as Element, 10);
    }
  }

  // Fallback: search all links in main content (lower priority)
  const allLinks = searchArea.querySelectorAll('a[href*="/remiss"]');
  for (const link of allLinks) {
    processLink(link as Element, 0);
  }

  if (candidateLinks.length === 0) {
    console.log('No valid remiss links found on page');
    return null;
  }

  // Sort by score and return the best match
  candidateLinks.sort((a, b) => b.score - a.score);
  console.log(`Found ${candidateLinks.length} candidate remiss links, best: ${candidateLinks[0].url} (score: ${candidateLinks[0].score})`);
  return candidateLinks[0].url;
}

// NOTE: classifyFileType, extractOrganization, parseRemissPage
// are now imported from _shared/remiss-parser.ts
// The following functions were removed from this file:
// - classifyFileType() → imported
// - extractOrganization() → imported  
// - parseRemissPage() → imported
//
// VERIFICATION: Log format preserved - extraction_log output unchanged.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { document_id, limit = 10, skip_existing = true, remiss_url, discovery_method: providedMethod } = body;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: Array<{
      document_id: string;
      doc_number: string;
      status: 'success' | 'no_remiss' | 'error' | 'skipped';
      discovery_method?: DiscoveryMethod;
      remiss_url?: string;
      remissvar_count?: number;
      error?: string;
    }> = [];

    // Build query
    let query = supabase
      .from('documents')
      .select('id, doc_number, url, title')
      .eq('doc_type', 'sou')
      .not('url', 'is', null);

    if (document_id) {
      query = query.eq('id', document_id);
    } else {
      query = query.limit(limit);
    }

    const { data: souDocuments, error: fetchError } = await query;

    if (fetchError) throw fetchError;
    if (!souDocuments || souDocuments.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No SOU documents to process', results: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${souDocuments.length} SOU documents for remiss links...`);

    for (const sou of souDocuments) {
      console.log(`\n--- Processing ${sou.doc_number} ---`);

      // Check if already processed
      if (skip_existing) {
        const { data: existing } = await supabase
          .from('remiss_documents')
          .select('id')
          .eq('parent_document_id', sou.id)
          .maybeSingle();

        if (existing) {
          console.log(`Skipping ${sou.doc_number} - already has remiss record`);
          results.push({
            document_id: sou.id,
            doc_number: sou.doc_number,
            status: 'skipped',
          });
          continue;
        }
      }

      try {
        let remissLink: string | null = null;
        let discoveryMethod: DiscoveryMethod = 'not_found';

        // Phase A: Try document_references first
        console.log(`Phase A: Checking document_references for ${sou.doc_number}`);
        const refResult = await findRemissFromReferences(supabase, sou.id);
        if (refResult) {
          remissLink = refResult.url;
          discoveryMethod = refResult.method;
          console.log(`Found remiss via references: ${remissLink}`);
        }

        // Phase B: Scrape SOU page if no reference found
        if (!remissLink && sou.url) {
          console.log(`Phase B: Scraping SOU page for ${sou.doc_number}`);
          const souResponse = await fetch(sou.url, {
            headers: {
              'User-Agent': 'Vision-Connector-Tool/1.0 (Educational Research Tool)',
            },
          });

          if (souResponse.ok) {
            const souHtml = await souResponse.text();
            remissLink = findRemissLinkFromPage(souHtml, sou.url);
            if (remissLink) {
              discoveryMethod = 'page_scrape';
              console.log(`Found remiss via page scrape: ${remissLink}`);
            }
          } else {
            console.log(`HTTP ${souResponse.status} fetching SOU page`);
          }
        }

        if (!remissLink) {
          console.log(`No remiss link found for ${sou.doc_number}`);
          results.push({
            document_id: sou.id,
            doc_number: sou.doc_number,
            status: 'no_remiss',
            discovery_method: 'not_found',
          });
          continue;
        }

        // Fetch and parse the remiss page
        const remissResponse = await fetch(remissLink, {
          headers: {
            'User-Agent': 'Vision-Connector-Tool/1.0 (Educational Research Tool)',
          },
        });

        if (!remissResponse.ok) {
          throw new Error(`HTTP ${remissResponse.status} fetching remiss page`);
        }

        const remissHtml = await remissResponse.text();
        const remissData = parseRemissPage(remissHtml, remissLink);

        console.log(`Extracted ${remissData.remissvar_documents.length} remissvar documents`);

        // Store the remiss document
        const { data: remissDoc, error: remissInsertError } = await supabase
          .from('remiss_documents')
          .upsert({
            parent_document_id: sou.id,
            remiss_page_url: remissData.remiss_page_url,
            remissinstanser_pdf_url: remissData.remissinstanser_pdf?.url,
            title: remissData.remiss_title,
            remiss_deadline: remissData.remiss_deadline,
            status: 'scraped',
            remissvar_count: remissData.remissvar_documents.length,
            metadata: {
              discovery_method: discoveryMethod,
              extraction_log: remissData.extraction_log,
              remissinstanser_filename: remissData.remissinstanser_pdf?.filename,
            },
          }, {
            onConflict: 'remiss_page_url',
          })
          .select()
          .single();

        if (remissInsertError) throw remissInsertError;

        // Store each remissvar response
        for (const rv of remissData.remissvar_documents) {
          const { error: rvError } = await supabase
            .from('remiss_responses')
            .upsert({
              remiss_id: remissDoc.id,
              file_url: rv.url,
              filename: rv.filename,
              responding_organization: rv.responding_organization,
              file_type: rv.file_type,
              status: rv.file_type === 'pdf' ? 'pending' : 'skipped_non_pdf',
              metadata: {
                title: rv.title,
              },
            }, {
              onConflict: 'remiss_id,file_url',
            });

          if (rvError) {
            console.error(`Error inserting remissvar: ${rvError.message}`);
          }
        }

        results.push({
          document_id: sou.id,
          doc_number: sou.doc_number,
          status: 'success',
          discovery_method: discoveryMethod,
          remiss_url: remissLink,
          remissvar_count: remissData.remissvar_documents.length,
        });

      } catch (err) {
        console.error(`Error processing ${sou.doc_number}:`, err);
        results.push({
          document_id: sou.id,
          doc_number: sou.doc_number,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Summary stats
    const summary = {
      total_processed: results.length,
      success: results.filter(r => r.status === 'success').length,
      no_remiss: results.filter(r => r.status === 'no_remiss').length,
      errors: results.filter(r => r.status === 'error').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      total_remissvar: results.reduce((sum, r) => sum + (r.remissvar_count || 0), 0),
      by_discovery_method: {
        lagstiftningskedja: results.filter(r => r.discovery_method === 'lagstiftningskedja').length,
        index_match: results.filter(r => r.discovery_method === 'index_match').length,
        page_scrape: results.filter(r => r.discovery_method === 'page_scrape').length,
        manual: results.filter(r => r.discovery_method === 'manual').length,
        not_found: results.filter(r => r.discovery_method === 'not_found').length,
      },
    };

    console.log('\n=== Summary ===');
    console.log(JSON.stringify(summary, null, 2));

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in scrape-sou-remiss:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'An error occurred',
        details: error instanceof Error ? error.stack : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
