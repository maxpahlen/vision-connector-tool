import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DOMParser, Element } from 'https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts';

/**
 * Phase 5.3: Remiss Scraper for SOU Documents
 * 
 * This edge function:
 * 1. Takes an SOU document from our database
 * 2. Visits its regeringen.se page
 * 3. Looks for "Remiss" links in Lagstiftningskedja/Genvägar sections
 * 4. Parses the remiss page to extract remissvar documents
 * 5. Stores results in remiss_documents and remiss_responses tables
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RemissvarDocument {
  url: string;
  filename: string;
  title?: string;
  responding_organization?: string;
  file_type: 'pdf' | 'word' | 'excel' | 'other';
}

interface RemissPageResult {
  remiss_page_url: string;
  remiss_title?: string;
  remiss_deadline?: string;
  remissinstanser_pdf?: {
    url: string;
    filename: string;
  };
  remissvar_documents: RemissvarDocument[];
  extraction_log: string[];
}

/**
 * Extract remiss link from SOU page's Lagstiftningskedja/Genvägar section
 */
function findRemissLink(html: string, baseUrl: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) return null;

  const log: string[] = [];

  // Look for Lagstiftningskedja or Genvägar sections
  const sections = doc.querySelectorAll('.publication-shortcuts, .shortcuts, [class*="genvag"], [class*="shortcut"]');
  log.push(`Found ${sections.length} shortcut sections`);

  // Also look for any links containing "remiss" in the page
  const allLinks = doc.querySelectorAll('a[href*="/remiss"]');
  
  for (const link of allLinks) {
    const href = (link as Element).getAttribute('href');
    const text = (link as Element).textContent?.toLowerCase() || '';
    
    // Match remiss links but exclude remissvar links
    if (href && (text.includes('remiss') || href.includes('/remisser/'))) {
      // Skip if it's a remissvar link
      if (text.includes('remissvar') || text.includes('svar')) continue;
      
      // Build full URL
      const fullUrl = href.startsWith('http') ? href : `https://www.regeringen.se${href}`;
      log.push(`Found remiss link: ${fullUrl}`);
      return fullUrl;
    }
  }

  // Fallback: look in specific containers
  const containers = doc.querySelectorAll('.block-related, .related-content, aside');
  for (const container of containers) {
    const containerEl = container as Element;
    const links = containerEl.querySelectorAll('a');
    for (const link of links) {
      const href = (link as Element).getAttribute('href');
      const text = (link as Element).textContent?.toLowerCase() || '';
      
      if (href && text.includes('remiss') && !text.includes('remissvar')) {
        const fullUrl = href.startsWith('http') ? href : `https://www.regeringen.se${href}`;
        log.push(`Found remiss link in container: ${fullUrl}`);
        return fullUrl;
      }
    }
  }

  log.push('No remiss link found');
  console.log(log.join('\n'));
  return null;
}

/**
 * Classify file type from URL and link text
 */
function classifyFileType(url: string, linkText: string): 'pdf' | 'word' | 'excel' | 'other' {
  const lowerUrl = url.toLowerCase();
  const lowerText = linkText.toLowerCase();
  
  if (lowerUrl.endsWith('.pdf') || lowerText.includes('pdf')) return 'pdf';
  if (lowerUrl.match(/\.(docx?|rtf)$/) || lowerText.includes('word')) return 'word';
  if (lowerUrl.match(/\.(xlsx?|csv)$/) || lowerText.includes('excel')) return 'excel';
  
  // Check for contentdisposition hints in URL
  if (lowerUrl.includes('contentdisposition=attachment')) {
    if (lowerUrl.includes('.pdf')) return 'pdf';
    // Default to PDF for government document downloads
    return 'pdf';
  }
  
  return 'other';
}

/**
 * Extract organization name from filename or link text
 */
function extractOrganization(filename: string, linkText: string): string | null {
  // Common patterns in remissvar filenames
  // Example: "Remissvar-Sveriges-Kommuner-och-Regioner.pdf"
  // Example: "Naturvårdsverket.pdf"
  
  const text = linkText || filename;
  if (!text) return null;
  
  // Remove common prefixes
  let org = text
    .replace(/^remissvar[-_\s]*/i, '')
    .replace(/\.pdf$/i, '')
    .replace(/\.docx?$/i, '')
    .replace(/[-_]/g, ' ')
    .trim();
  
  // If too short, it's probably not a real org name
  if (org.length < 3) return null;
  
  return org;
}

/**
 * Parse a remiss page to extract remissvar documents
 */
function parseRemissPage(html: string, remissUrl: string): RemissPageResult {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) {
    return {
      remiss_page_url: remissUrl,
      remissvar_documents: [],
      extraction_log: ['Failed to parse HTML'],
    };
  }

  const log: string[] = [];
  const remissvarDocs: RemissvarDocument[] = [];
  let remissinstanser: { url: string; filename: string } | undefined;

  // Extract title
  const h1 = doc.querySelector('h1');
  const remissTitle = h1?.textContent?.trim();
  log.push(`Remiss title: ${remissTitle || 'not found'}`);

  // Look for deadline
  let remissDeadline: string | undefined;
  const deadlinePatterns = [
    /sista\s+svarsdatum[:\s]+(\d{1,2}\s+\w+\s+\d{4})/i,
    /senast\s+(\d{1,2}\s+\w+\s+\d{4})/i,
    /(\d{4}-\d{2}-\d{2})/,
  ];
  const pageText = doc.body?.textContent || '';
  for (const pattern of deadlinePatterns) {
    const match = pageText.match(pattern);
    if (match) {
      remissDeadline = match[1];
      log.push(`Found deadline: ${remissDeadline}`);
      break;
    }
  }

  // Find all download links
  const downloadSections = doc.querySelectorAll('.download-document, .document-list, [class*="download"], [class*="remissvar"]');
  log.push(`Found ${downloadSections.length} download sections`);

  // Also search for direct PDF links
  const allLinks = doc.querySelectorAll('a[href*=".pdf"], a[href*="contentdisposition=attachment"], a[href*="/download/"]');
  log.push(`Found ${allLinks.length} potential document links`);

  const seenUrls = new Set<string>();

  for (const link of allLinks) {
    const href = (link as Element).getAttribute('href');
    if (!href) continue;

    const fullUrl = href.startsWith('http') ? href : `https://www.regeringen.se${href}`;
    
    // Skip duplicates
    if (seenUrls.has(fullUrl)) continue;
    seenUrls.add(fullUrl);

    const linkText = (link as Element).textContent?.trim() || '';
    const filename = fullUrl.split('/').pop()?.split('?')[0] || '';
    const fileType = classifyFileType(fullUrl, linkText);

    // Check if this is the remissinstanser list
    if (linkText.toLowerCase().includes('remissinstans') || 
        filename.toLowerCase().includes('remissinstans') ||
        linkText.toLowerCase().includes('sändlista')) {
      remissinstanser = { url: fullUrl, filename };
      log.push(`Found remissinstanser PDF: ${filename}`);
      continue;
    }

    // Check if this looks like a remissvar
    const isRemissvar = 
      linkText.toLowerCase().includes('remissvar') ||
      linkText.toLowerCase().includes('yttrande') ||
      filename.toLowerCase().includes('remissvar') ||
      // If in a remissvar section
      (link as Element).closest('[class*="remissvar"]') !== null;

    if (isRemissvar || fileType === 'pdf') {
      const organization = extractOrganization(filename, linkText);
      
      remissvarDocs.push({
        url: fullUrl,
        filename,
        title: linkText || undefined,
        responding_organization: organization || undefined,
        file_type: fileType,
      });
      log.push(`Found remissvar: ${filename} from ${organization || 'unknown org'}`);
    }
  }

  log.push(`Total remissvar documents found: ${remissvarDocs.length}`);

  return {
    remiss_page_url: remissUrl,
    remiss_title: remissTitle,
    remiss_deadline: remissDeadline,
    remissinstanser_pdf: remissinstanser,
    remissvar_documents: remissvarDocs,
    extraction_log: log,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { document_id, limit = 10, skip_existing = true } = body;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const results: Array<{
      document_id: string;
      doc_number: string;
      status: 'success' | 'no_remiss' | 'error' | 'skipped';
      remiss_url?: string;
      remissvar_count?: number;
      error?: string;
    }> = [];

    // If specific document_id provided, process just that one
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
        // Fetch the SOU page
        const souResponse = await fetch(sou.url!, {
          headers: {
            'User-Agent': 'Vision-Connector-Tool/1.0 (Educational Research Tool)',
          },
        });

        if (!souResponse.ok) {
          throw new Error(`HTTP ${souResponse.status} fetching SOU page`);
        }

        const souHtml = await souResponse.text();
        const remissLink = findRemissLink(souHtml, sou.url!);

        if (!remissLink) {
          console.log(`No remiss link found for ${sou.doc_number}`);
          results.push({
            document_id: sou.id,
            doc_number: sou.doc_number,
            status: 'no_remiss',
          });
          continue;
        }

        console.log(`Found remiss link: ${remissLink}`);

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
