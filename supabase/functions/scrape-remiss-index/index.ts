import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DOMParser, Element } from 'https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Regex patterns for extracting SOU references from remiss titles
const SOU_PATTERN = /SOU\s+(\d{4}):(\d+)/gi;
const DIR_PATTERN = /Dir\.\s+(\d{4}):(\d+)/gi;

interface RemissListing {
  title: string;
  url: string;
  publicationDate: string | null;
  extractedSouNumbers: string[];
  extractedDirNumbers: string[];
}

// UI-aligned interfaces (snake_case)
interface MatchedRemiss {
  remiss_url: string;
  title: string;
  publication_date: string | null;
  sou_references: string[];
  dir_references: string[];
  matched_document: {
    id: string;
    doc_number: string;
    doc_type: string;
    title: string;
  };
  discovery_method: 'index_match';
}

interface OrphanRemiss {
  remiss_url: string;
  title: string;
  publication_date: string | null;
  sou_references: string[];
  dir_references: string[];
  reason: 'no_document_match' | 'no_reference_found';
}

/**
 * Normalize doc_number for matching (trim, consistent casing)
 */
function normalizeDocNumber(docNumber: string): string {
  return docNumber.trim().toUpperCase().replace(/\s+/g, ' ');
}

/**
 * Parse a single remiss listing item from the index page HTML
 */
function parseRemissListing(item: Element): RemissListing | null {
  // The listing structure on regeringen.se/remisser uses .link-list or similar
  const linkEl = item.querySelector('a[href]');
  if (!linkEl) return null;
  
  const href = linkEl.getAttribute('href') || '';
  const title = linkEl.textContent?.trim() || '';
  
  if (!href || !title) return null;
  
  // Build full URL
  let url = href;
  if (!url.startsWith('http')) {
    url = `https://www.regeringen.se${url.startsWith('/') ? '' : '/'}${url}`;
  }
  
  // Validate this is an actual remiss page (not the index)
  if (!url.includes('/remisser/') || url.match(/\/remisser\/?(\?|#|$)/)) {
    return null;
  }
  
  // Must have date pattern in URL: /remisser/YYYY/MM/
  if (!url.match(/\/remisser\/\d{4}\/\d{2}\//)) {
    return null;
  }
  
  // Extract publication date from URL if possible (format: /remisser/2024/01/...)
  const dateMatch = url.match(/\/remisser\/(\d{4})\/(\d{2})\//);
  let publicationDate: string | null = null;
  if (dateMatch) {
    publicationDate = `${dateMatch[1]}-${dateMatch[2]}-01`;
  }
  
  // Also try to find date in the listing item
  const dateEl = item.querySelector('.date, time, [datetime], .published');
  if (dateEl) {
    const dateAttr = dateEl.getAttribute('datetime');
    if (dateAttr) {
      publicationDate = dateAttr.split('T')[0];
    } else {
      // Try to parse Swedish date format (e.g., "15 januari 2024")
      const dateText = dateEl.textContent?.trim() || '';
      const swedishDateMatch = dateText.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
      if (swedishDateMatch) {
        const monthMap: Record<string, string> = {
          'januari': '01', 'februari': '02', 'mars': '03', 'april': '04',
          'maj': '05', 'juni': '06', 'juli': '07', 'augusti': '08',
          'september': '09', 'oktober': '10', 'november': '11', 'december': '12'
        };
        const month = monthMap[swedishDateMatch[2].toLowerCase()];
        if (month) {
          const day = swedishDateMatch[1].padStart(2, '0');
          publicationDate = `${swedishDateMatch[3]}-${month}-${day}`;
        }
      }
    }
  }
  
  // Extract SOU references from title
  const souMatches: string[] = [];
  let souMatch;
  while ((souMatch = SOU_PATTERN.exec(title)) !== null) {
    souMatches.push(`SOU ${souMatch[1]}:${souMatch[2]}`);
  }
  SOU_PATTERN.lastIndex = 0; // Reset regex state
  
  // Extract directive references from title
  const dirMatches: string[] = [];
  let dirMatch;
  while ((dirMatch = DIR_PATTERN.exec(title)) !== null) {
    dirMatches.push(`Dir. ${dirMatch[1]}:${dirMatch[2]}`);
  }
  DIR_PATTERN.lastIndex = 0; // Reset regex state
  
  return {
    title,
    url,
    publicationDate,
    extractedSouNumbers: souMatches,
    extractedDirNumbers: dirMatches,
  };
}

/**
 * Parse the remiss index page HTML to extract listings
 */
function parseRemissIndexPage(html: string): RemissListing[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) {
    console.error('[RemissIndex] Failed to parse HTML');
    return [];
  }
  
  const listings: RemissListing[] = [];
  
  // Strategy 1: Look for .link-list items (common pattern)
  const linkListItems = doc.querySelectorAll('.link-list li, .link-list__item');
  console.log(`[RemissIndex] Found ${linkListItems.length} .link-list items`);
  for (let i = 0; i < linkListItems.length; i++) {
    const listing = parseRemissListing(linkListItems[i] as Element);
    if (listing) listings.push(listing);
  }
  
  // Strategy 2: Look for article/card-style listings
  if (listings.length === 0) {
    const articles = doc.querySelectorAll('article, .card, .list-item, .teaser');
    console.log(`[RemissIndex] Trying article/card strategy: ${articles.length} items`);
    for (let i = 0; i < articles.length; i++) {
      const listing = parseRemissListing(articles[i] as Element);
      if (listing) listings.push(listing);
    }
  }
  
  // Strategy 3: Generic list items with links containing /remisser/
  if (listings.length === 0) {
    const allListItems = doc.querySelectorAll('li');
    console.log(`[RemissIndex] Trying generic li strategy: ${allListItems.length} items`);
    for (let i = 0; i < allListItems.length; i++) {
      const li = allListItems[i] as Element;
      const link = li.querySelector('a[href*="/remisser/"]');
      if (link) {
        const listing = parseRemissListing(li);
        if (listing) listings.push(listing);
      }
    }
  }
  
  // Strategy 4: Direct anchor links in main content
  if (listings.length === 0) {
    const mainContent = doc.querySelector('main, .main-content, #content, article');
    if (mainContent) {
      const remissLinks = mainContent.querySelectorAll('a[href*="/remisser/"]');
      console.log(`[RemissIndex] Trying direct link strategy: ${remissLinks.length} links`);
      for (let i = 0; i < remissLinks.length; i++) {
        const link = remissLinks[i] as Element;
        const href = link.getAttribute('href') || '';
        const title = link.textContent?.trim() || '';
        
        if (!href || !title) continue;
        
        let url = href;
        if (!url.startsWith('http')) {
          url = `https://www.regeringen.se${url.startsWith('/') ? '' : '/'}${url}`;
        }
        
        // Validate it's a specific remiss page
        if (!url.match(/\/remisser\/\d{4}\/\d{2}\//)) continue;
        
        // Extract SOU/Dir references
        const souMatches: string[] = [];
        let souMatch;
        while ((souMatch = SOU_PATTERN.exec(title)) !== null) {
          souMatches.push(`SOU ${souMatch[1]}:${souMatch[2]}`);
        }
        SOU_PATTERN.lastIndex = 0;
        
        const dirMatches: string[] = [];
        let dirMatch;
        while ((dirMatch = DIR_PATTERN.exec(title)) !== null) {
          dirMatches.push(`Dir. ${dirMatch[1]}:${dirMatch[2]}`);
        }
        DIR_PATTERN.lastIndex = 0;
        
        const dateMatch = url.match(/\/remisser\/(\d{4})\/(\d{2})\//);
        const publicationDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-01` : null;
        
        listings.push({
          title,
          url,
          publicationDate,
          extractedSouNumbers: souMatches,
          extractedDirNumbers: dirMatches,
        });
      }
    }
  }
  
  // Deduplicate by URL
  const seenUrls = new Set<string>();
  const uniqueListings = listings.filter(l => {
    if (seenUrls.has(l.url)) return false;
    seenUrls.add(l.url);
    return true;
  });
  
  console.log(`[RemissIndex] Parsed ${uniqueListings.length} unique remiss listings`);
  return uniqueListings;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const body = await req.json();
    const page = body.page || 1;
    const maxPages = body.max_pages || 1;
    const dryRun = body.dry_run || false;
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Flattened arrays for UI contract
    const allMatched: MatchedRemiss[] = [];
    const allOrphan: OrphanRemiss[] = [];
    const allErrors: string[] = [];
    let totalListings = 0;
    let inserted = 0;
    let skippedDuplicates = 0;
    
    for (let currentPage = page; currentPage < page + maxPages; currentPage++) {
      console.log(`[RemissIndex] Fetching page ${currentPage}...`);
      
      const indexUrl = `https://www.regeringen.se/remisser/?page=${currentPage}`;
      
      const response = await fetch(indexUrl, {
        headers: {
          'User-Agent': 'Vision-Connector-Tool/1.0 (Educational Research Tool)',
        },
      });
      
      if (!response.ok) {
        allErrors.push(`HTTP ${response.status} from page ${currentPage}`);
        continue;
      }
      
      const html = await response.text();
      const listings = parseRemissIndexPage(html);
      totalListings += listings.length;
      
      // Log sample of extracted references for debugging
      if (listings.length > 0 && currentPage === page) {
        const firstFive = listings.slice(0, 5);
        console.log(`[RemissIndex] Sample refs from page ${currentPage}:`, 
          firstFive.map(l => ({
            title: l.title.substring(0, 50),
            sou: l.extractedSouNumbers,
            dir: l.extractedDirNumbers,
          }))
        );
      }
      
      for (const listing of listings) {
        const souRefs = listing.extractedSouNumbers;
        const dirRefs = listing.extractedDirNumbers;
        const allReferences = [...souRefs, ...dirRefs];
        
        if (allReferences.length === 0) {
          allOrphan.push({
            remiss_url: listing.url,
            title: listing.title,
            publication_date: listing.publicationDate,
            sou_references: [],
            dir_references: [],
            reason: 'no_reference_found',
          });
          continue;
        }
        
        // Try to match each reference to an existing document with normalization
        let foundMatch = false;
        for (const docNumber of allReferences) {
          const normalizedDocNumber = normalizeDocNumber(docNumber);
          
          // Query with exact match first
          const { data: doc, error } = await supabase
            .from('documents')
            .select('id, doc_number, doc_type, title')
            .eq('doc_number', docNumber)
            .maybeSingle();
          
          if (error) {
            allErrors.push(`Query error for ${docNumber}: ${error.message}`);
            continue;
          }
          
          // If no exact match, try normalized query (case-insensitive via ilike)
          let matchedDoc = doc;
          if (!matchedDoc) {
            const { data: fuzzyDoc, error: fuzzyError } = await supabase
              .from('documents')
              .select('id, doc_number, doc_type, title')
              .ilike('doc_number', normalizedDocNumber)
              .maybeSingle();
            
            if (!fuzzyError && fuzzyDoc) {
              console.log(`[RemissIndex] Fuzzy matched "${docNumber}" -> "${fuzzyDoc.doc_number}"`);
              matchedDoc = fuzzyDoc;
            }
          }
          
          if (matchedDoc) {
            allMatched.push({
              remiss_url: listing.url,
              title: listing.title,
              publication_date: listing.publicationDate,
              sou_references: souRefs,
              dir_references: dirRefs,
              matched_document: matchedDoc,
              discovery_method: 'index_match',
            });
            foundMatch = true;
            
            // If not dry run, create remiss_document entry
            if (!dryRun) {
              const { error: insertError, data: insertData } = await supabase
                .from('remiss_documents')
                .upsert({
                  parent_document_id: matchedDoc.id,
                  remiss_page_url: listing.url,
                  title: listing.title,
                  status: 'discovered',
                  metadata: {
                    discovery_method: 'index_match',
                    discovered_at: new Date().toISOString(),
                    sou_references: souRefs,
                    dir_references: dirRefs,
                  },
                }, {
                  onConflict: 'remiss_page_url',
                  ignoreDuplicates: false,
                })
                .select('id');
              
              if (insertError) {
                if (insertError.code === '23505') { // Duplicate key
                  skippedDuplicates++;
                } else {
                  allErrors.push(`Insert error for remiss ${listing.url}: ${insertError.message}`);
                }
              } else if (insertData && insertData.length > 0) {
                inserted++;
              }
            }
            
            break; // Only need one match per remiss
          }
        }
        
        if (!foundMatch) {
          allOrphan.push({
            remiss_url: listing.url,
            title: listing.title,
            publication_date: listing.publicationDate,
            sou_references: souRefs,
            dir_references: dirRefs,
            reason: 'no_document_match',
          });
        }
      }
    }
    
    // Log unique SOU years referenced by orphans for debugging
    const orphanSouYears = new Set<string>();
    for (const o of allOrphan) {
      for (const ref of o.sou_references) {
        const yearMatch = ref.match(/SOU\s+(\d{4})/i);
        if (yearMatch) orphanSouYears.add(yearMatch[1]);
      }
    }
    if (orphanSouYears.size > 0) {
      console.log(`[RemissIndex] Orphan SOU years referenced:`, Array.from(orphanSouYears).sort());
    }
    
    // Summary aligned with UI expectations
    const summary = {
      pages_scraped: maxPages,
      total_listings: totalListings,
      matched: allMatched.length,
      orphaned: allOrphan.length,
      errors: allErrors.length,
      inserted: inserted,
      skipped_duplicates: skippedDuplicates,
      dry_run: dryRun,
    };
    
    console.log(`[RemissIndex] Summary:`, summary);
    
    return new Response(
      JSON.stringify({
        success: true,
        summary,
        matched: allMatched,
        orphan: allOrphan,
        errors: allErrors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('[RemissIndex] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
