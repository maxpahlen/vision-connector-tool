import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";
import { classifyGenvagLink, extractDocNumber, type GenvagLink, type ClassifiedReference } from "../_shared/genvag-classifier.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Proposition Index Scraper v5.2
 * 
 * Scrapes propositions (propositioner) from:
 * https://www.regeringen.se/rattsliga-dokument/proposition/
 * 
 * Part of Phase 5.2: Proposition Slice
 * 
 * Features:
 * - Pagination support (?p=N)
 * - Detail page extraction (PDF, Lagstiftningskedja)
 * - Document reference classification
 */

interface PropositionMetadata {
  title: string;
  docNumber: string;  // e.g., "Prop. 2024/25:123"
  url: string;
  pdfUrl?: string;
  ministry?: string;
  publicationDate?: string;
}

interface LagstiftningskedjaLink {
  url: string;
  anchorText: string;
  docType?: string;
}

interface ScrapeResult {
  propositions: PropositionMetadata[];
  page: number;
  hasMore: boolean;
  inserted: number;
  skipped: number;
  references_created: number;
  errors: string[];
}

/**
 * Parse proposition listing from the index page
 * URL: https://www.regeringen.se/rattsliga-dokument/proposition/
 * 
 * Actual HTML structure (2025):
 * <ul class="list--block">
 *   <li>
 *     <div class="sortcompact">
 *       <a href="/rattsliga-dokument/proposition/2025/12/prop.-20252664">Title, Prop. 2025/26:64</a>
 *       <div class="block--timeLinks">
 *         <p>Publicerad <time datetime="2025-12-02">02 december 2025</time> 
 *            · <a href="...">Proposition</a>, ... från <a href="...">Justitiedepartementet</a></p>
 *       </div>
 *     </div>
 *   </li>
 * </ul>
 */
function parsePropositionList(html: string, baseUrl: string): PropositionMetadata[] {
  const propositions: PropositionMetadata[] = [];
  
  // Find all list items with sortcompact div
  const itemPattern = /<li>\s*<div class="sortcompact">([\s\S]*?)<\/div>\s*<\/li>/gi;
  
  let match;
  while ((match = itemPattern.exec(html)) !== null) {
    const itemHtml = match[1];
    
    // Extract main link (title + URL)
    const linkMatch = itemHtml.match(/<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
    if (!linkMatch) continue;
    
    let url = linkMatch[1];
    const linkText = linkMatch[2].trim();
    
    // Normalize URL
    if (!url.startsWith('http')) {
      url = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    }
    
    // Skip if not a proposition URL
    if (!url.includes('/proposition/')) {
      continue;
    }
    
    // Extract doc number from link text (e.g., "Some title, Prop. 2025/26:64")
    const docNumMatch = linkText.match(/Prop\.\s*(\d{4}\/\d{2}:\d+)/i);
    if (!docNumMatch) {
      console.log('[Proposition Scraper] No doc number found in:', linkText.substring(0, 80));
      continue;
    }
    
    const docNumber = `Prop. ${docNumMatch[1]}`;
    
    // Extract title (everything before "Prop.")
    const titleMatch = linkText.match(/^(.+?),?\s*Prop\./i);
    const title = titleMatch ? titleMatch[1].trim() : linkText;
    
    // Extract publication date from <time datetime="YYYY-MM-DD">
    const dateMatch = itemHtml.match(/<time\s+datetime="(\d{4}-\d{2}-\d{2})">/i);
    const publicationDate = dateMatch ? dateMatch[1] : undefined;
    
    // Extract ministry from "från <a href="...">Departement</a>"
    // Pattern: från <a href="/tx/XXXX">Ministry</a>
    const ministryMatch = itemHtml.match(/från\s+<a[^>]+>([^<]+)<\/a>/i);
    let ministry = ministryMatch ? ministryMatch[1].trim() : undefined;
    
    // Clean up ministry name (remove "Regeringen" if that's what was matched)
    if (ministry === 'Regeringen') {
      // Try to find actual department before "Regeringen"
      const deptMatches = itemHtml.matchAll(/från\s+<a[^>]+>([^<]+)<\/a>/gi);
      for (const dm of deptMatches) {
        if (dm[1] && dm[1].trim() !== 'Regeringen') {
          ministry = dm[1].trim();
          break;
        }
      }
    }
    
    propositions.push({
      title,
      docNumber,
      url,
      ministry,
      publicationDate
    });
  }
  
  console.log('[Proposition Scraper] Parsed', propositions.length, 'propositions from index');
  
  return propositions;
}

/**
 * Parse Swedish date to ISO format
 */
function parseSwedishDate(dateStr: string): string | undefined {
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  const months: Record<string, string> = {
    'januari': '01', 'februari': '02', 'mars': '03', 'april': '04',
    'maj': '05', 'juni': '06', 'juli': '07', 'augusti': '08',
    'september': '09', 'oktober': '10', 'november': '11', 'december': '12'
  };
  
  const match = dateStr.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/i);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = months[match[2].toLowerCase()];
    const year = match[3];
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }
  
  return undefined;
}

/**
 * Extract PDF URL from detail page
 */
function extractPdfUrl(html: string, baseUrl: string): string | undefined {
  const pdfPatterns = [
    /href="([^"]+\.pdf)"/i,
    /href="([^"]+\/pdf\/[^"]+)"/i,
    /data-pdf-url="([^"]+)"/i,
    /<a[^>]*class="[^"]*download[^"]*"[^>]*href="([^"]+)"/i
  ];
  
  for (const pattern of pdfPatterns) {
    const match = html.match(pattern);
    if (match) {
      let url = match[1];
      if (!url.startsWith('http')) {
        url = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
      }
      return url;
    }
  }
  
  return undefined;
}

/**
 * Extract Lagstiftningskedja (legislative chain) links from detail page
 * These are high-quality document-to-document references
 */
function extractLagstiftningskedjaLinks(html: string, baseUrl: string): LagstiftningskedjaLink[] {
  const links: LagstiftningskedjaLink[] = [];
  
  // Find lagstiftningskedja section
  const sectionPatterns = [
    /<div[^>]*class="[^"]*lagstiftningskedja[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<section[^>]*id="[^"]*lagstiftningskedja[^"]*"[^>]*>([\s\S]*?)<\/section>/gi,
    /<div[^>]*id="[^"]*legislative[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    // Fallback: look for h2/h3 with "Lagstiftningskedja" and capture following content
    /Lagstiftningskedja[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/gi
  ];
  
  let sectionHtml = '';
  for (const pattern of sectionPatterns) {
    const match = html.match(pattern);
    if (match) {
      sectionHtml = match[0];
      break;
    }
  }
  
  if (!sectionHtml) {
    // Try to find "Relaterat" section as fallback
    const relatertMatch = html.match(/<div[^>]*class="[^"]*related[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
    if (relatertMatch) {
      sectionHtml = relatertMatch[0];
    }
  }
  
  if (!sectionHtml) {
    return links;
  }
  
  // Extract all links from the section
  const linkPattern = /<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  
  while ((match = linkPattern.exec(sectionHtml)) !== null) {
    let url = match[1];
    const anchorText = match[2].trim();
    
    // Skip empty or anchor-only links
    if (!url || url === '#' || !anchorText) {
      continue;
    }
    
    // Normalize URL
    if (!url.startsWith('http')) {
      url = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    }
    
    // Determine document type from URL
    let docType: string | undefined;
    if (url.includes('/statens-offentliga-utredningar/') || url.includes('/sou-')) {
      docType = 'sou';
    } else if (url.includes('/kommittedirektiv/') || url.includes('/dir-')) {
      docType = 'directive';
    } else if (url.includes('/proposition/') || url.includes('/prop-')) {
      docType = 'proposition';
    } else if (url.includes('/remisser/')) {
      docType = 'remiss';
    }
    
    links.push({
      url,
      anchorText,
      docType
    });
  }
  
  return links;
}

/**
 * Process and store document references from lagstiftningskedja links
 */
async function storeDocumentReferences(
  supabase: any,
  sourceDocId: string,
  links: LagstiftningskedjaLink[]
): Promise<number> {
  let created = 0;
  
  for (const link of links) {
    // Classify the link
    const genvagLink: GenvagLink = {
      url: link.url,
      anchorText: link.anchorText
    };
    const classification = classifyGenvagLink(genvagLink);
    
    // Skip external URLs for now
    if (classification.isExternalUrl) {
      console.log('[Proposition Scraper] Skipping external URL', { url: link.url });
      continue;
    }
    
    // Extract target doc number
    const targetDocNumber = classification.targetDocNumber || extractDocNumber(link.url);
    
    // Try to find existing target document
    let targetDocId: string | null = null;
    if (targetDocNumber) {
      const { data: targetDoc } = await supabase
        .from('documents')
        .select('id')
        .eq('doc_number', targetDocNumber)
        .maybeSingle();
      
      if (targetDoc) {
        targetDocId = targetDoc.id;
      }
    }
    
    // Check for existing reference
    const { data: existingRef } = await supabase
      .from('document_references')
      .select('id')
      .eq('source_document_id', sourceDocId)
      .eq('target_doc_number', targetDocNumber || link.anchorText)
      .maybeSingle();
    
    if (existingRef) {
      console.log('[Proposition Scraper] Reference already exists', { sourceDocId, target: targetDocNumber });
      continue;
    }
    
    // Insert reference
    const { error: refError } = await supabase
      .from('document_references')
      .insert({
        source_document_id: sourceDocId,
        target_document_id: targetDocId,
        target_doc_number: targetDocNumber || link.anchorText,
        reference_type: classification.referenceType,
        confidence: classification.confidence,
        source_excerpt: `Lagstiftningskedja: ${link.anchorText}`
      });
    
    if (refError) {
      console.error('[Proposition Scraper] Failed to create reference', { error: refError.message });
    } else {
      created++;
      console.log('[Proposition Scraper] Created reference', { 
        type: classification.referenceType, 
        target: targetDocNumber || link.anchorText 
      });
    }
  }
  
  return created;
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
    const { page = 1, limit = 10, skipExisting = true } = await req.json().catch(() => ({}));
    
    console.log('[Proposition Scraper v5.2] Starting', { page, limit, skipExisting });
    
    // Build URL for proposition listing
    // Correct URL: https://www.regeringen.se/rattsliga-dokument/proposition/
    const baseUrl = 'https://www.regeringen.se';
    let listUrl = `${baseUrl}/rattsliga-dokument/proposition/`;
    
    if (page > 1) {
      listUrl += `?p=${page}`;
    }
    
    console.log('[Proposition Scraper v5.2] Fetching index', { url: listUrl });
    
    // Fetch proposition listing page
    const listResponse = await fetch(listUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LegislativeBot/5.2; +https://lovable.dev)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8'
      }
    });
    
    if (!listResponse.ok) {
      throw new Error(`Failed to fetch proposition list: ${listResponse.status}`);
    }
    
    const listHtml = await listResponse.text();
    const propositions = parsePropositionList(listHtml, baseUrl);
    
    console.log('[Proposition Scraper v5.2] Parsed index', { count: propositions.length });
    
    // Check for next page
    const hasMore = listHtml.includes(`?p=${page + 1}`) || 
                    listHtml.includes('rel="next"') || 
                    listHtml.includes('class="next"') ||
                    listHtml.includes('aria-label="Nästa sida"');
    
    const result: ScrapeResult = {
      propositions: [],
      page,
      hasMore,
      inserted: 0,
      skipped: 0,
      references_created: 0,
      errors: []
    };
    
    // Process each proposition (limited)
    const toProcess = propositions.slice(0, limit);
    
    for (const prop of toProcess) {
      try {
        // Check if already exists
        if (skipExisting) {
          const { data: existing } = await supabase
            .from('documents')
            .select('id')
            .eq('doc_number', prop.docNumber)
            .maybeSingle();
          
          if (existing) {
            console.log('[Proposition Scraper v5.2] Skipping existing', { docNumber: prop.docNumber });
            result.skipped++;
            continue;
          }
        }
        
        // Fetch detail page
        console.log('[Proposition Scraper v5.2] Fetching detail', { url: prop.url });
        
        const detailResponse = await fetch(prop.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LegislativeBot/5.2)',
            'Accept': 'text/html'
          }
        });
        
        let lagstiftningskedjaLinks: LagstiftningskedjaLink[] = [];
        
        if (detailResponse.ok) {
          const detailHtml = await detailResponse.text();
          
          // Extract PDF URL
          prop.pdfUrl = extractPdfUrl(detailHtml, baseUrl);
          
          // Extract Lagstiftningskedja links
          lagstiftningskedjaLinks = extractLagstiftningskedjaLinks(detailHtml, baseUrl);
          
          console.log('[Proposition Scraper v5.2] Detail extracted', { 
            docNumber: prop.docNumber,
            hasPdf: !!prop.pdfUrl,
            lagstiftningskedjaCount: lagstiftningskedjaLinks.length
          });
        }
        
        // Insert document
        const { data: insertedDoc, error: insertError } = await supabase
          .from('documents')
          .insert({
            title: prop.title,
            doc_number: prop.docNumber,
            doc_type: 'proposition',
            url: prop.url,
            pdf_url: prop.pdfUrl,
            ministry: prop.ministry,
            publication_date: prop.publicationDate,
            lifecycle_stage: 'proposition',
            metadata: {
              scraped_at: new Date().toISOString(),
              scraper_version: '5.2.0',
              lagstiftningskedja_count: lagstiftningskedjaLinks.length
            }
          })
          .select()
          .single();
        
        if (insertError) {
          console.error('[Proposition Scraper v5.2] Insert error', { 
            docNumber: prop.docNumber, 
            error: insertError.message 
          });
          result.errors.push(`Failed to insert ${prop.docNumber}: ${insertError.message}`);
          continue;
        }
        
        result.propositions.push(prop);
        result.inserted++;
        
        console.log('[Proposition Scraper v5.2] ✅ Inserted', { 
          id: insertedDoc.id,
          docNumber: prop.docNumber 
        });
        
        // Store document references from lagstiftningskedja
        if (lagstiftningskedjaLinks.length > 0) {
          const refsCreated = await storeDocumentReferences(
            supabase,
            insertedDoc.id,
            lagstiftningskedjaLinks
          );
          result.references_created += refsCreated;
        }
        
        // Rate limiting - be nice to the server
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (propError) {
        const errorMsg = propError instanceof Error ? propError.message : 'Unknown error';
        console.error('[Proposition Scraper v5.2] Error processing', { 
          docNumber: prop.docNumber, 
          error: errorMsg 
        });
        result.errors.push(`Error processing ${prop.docNumber}: ${errorMsg}`);
      }
    }
    
    console.log('[Proposition Scraper v5.2] Complete', { 
      inserted: result.inserted,
      skipped: result.skipped,
      references: result.references_created,
      errors: result.errors.length,
      hasMore 
    });
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('[Proposition Scraper v5.2] ❌ Error:', error);
    
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
