import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DOMParser, Element } from 'https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InquiryEntry {
  inquiryCode: string;
  title: string;
  ministry: string;
  regeringenUrl: string;
  pageType: 'avslutade' | 'pagaende';
}

// Extract year from inquiry code
// Example: "Ku 2025:02" -> 2025
function extractYearFromInquiryCode(inquiryCode: string): number | null {
  const pattern = /([A-ZÅÄÖa-zåäö]{1,3})\s+(\d{4}):(\d+)/i;
  const match = inquiryCode.match(pattern);
  return match ? parseInt(match[2], 10) : null;
}

// Check if there are more pages to scrape
function hasNextPage(html: string, currentPage: number): boolean {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) return false;
  
  // Look for pagination links, "next" buttons, or page numbers
  const paginationLinks = doc.querySelectorAll('a[href*="page="], .pagination a, .next, a[rel="next"]');
  
  for (const link of paginationLinks) {
    const href = (link as Element).getAttribute('href') || '';
    const linkText = link.textContent?.toLowerCase() || '';
    
    // Check if link points to next page
    if (href.includes(`page=${currentPage + 1}`) || linkText.includes('nästa') || linkText.includes('next')) {
      return true;
    }
  }
  
  return false;
}

// Normalize inquiry code to process_key format
// "Ku 2025:02" -> "ku-2025-02"
// Updated to include all ministry codes including newer ones like KN, LI
function normalizeProcessKey(inquiryCode: string): string {
  const pattern = /([A-ZÅÄÖa-zåäö]{1,3})\s+(\d{4}):(\d+)/i;
  const match = inquiryCode.match(pattern);
  
  if (!match) {
    // Fallback: lowercase and replace : and spaces with -
    return inquiryCode.toLowerCase().replace(/[:\s]/g, '-');
  }
  
  const [, dept, year, num] = match;
  return `${dept.toLowerCase()}-${year}-${num.padStart(2, '0')}`;
}

// Extract ministry from text
function extractMinistry(text: string): string {
  const ministries = [
    'Kulturdepartementet',
    'Utbildningsdepartementet',
    'Finansdepartementet',
    'Arbetsmarknadsdepartementet',
    'Socialdepartementet',
    'Miljödepartementet',
    'Näringsdepartementet',
    'Försvarsdepartementet',
    'Justitiedepartementet',
    'Infrastrukturdepartementet',
    'Utrikesdepartementet',
    'Klimat- och näringslivsdepartementet',
  ];
  
  for (const ministry of ministries) {
    if (text.includes(ministry)) {
      return ministry;
    }
  }
  
  return 'Okänt departement';
}

// Parse HTML to extract inquiry entries
function parseInquiryList(html: string, pageType: 'avslutade' | 'pagaende'): InquiryEntry[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) {
    throw new Error('Failed to parse HTML');
  }
  
  const entries: InquiryEntry[] = [];
  // Updated pattern to match all ministry codes (1-3 letters, including Swedish chars)
  const inquiryPattern = /([A-ZÅÄÖa-zåäö]{1,3})\s+(\d{4}):(\d+)/i;
  
  // Try multiple selectors to find list items
  const listItems = doc.querySelectorAll('li, article, .inquiry-item, [class*="utredning"]');
  
  console.log(`Found ${listItems.length} potential inquiry items on ${pageType} page`);
  
  for (const item of listItems) {
    const text = item.textContent || '';
    const inquiryMatch = text.match(inquiryPattern);
    
    if (!inquiryMatch) continue;
    
    const inquiryCode = inquiryMatch[0];
    
    // Find regeringen.se link
    const links = (item as Element).querySelectorAll('a');
    let regeringenUrl = '';
    
    for (const link of links) {
      const href = (link as Element).getAttribute('href') || '';
      if (href.includes('regeringen.se')) {
        regeringenUrl = href.startsWith('http') ? href : `https://www.regeringen.se${href}`;
        break;
      }
    }
    
    if (!regeringenUrl) {
      console.log(`No regeringen.se link found for ${inquiryCode}, skipping`);
      continue;
    }
    
    // Extract title (usually the link text or nearby heading)
    let title = '';
    const heading = (item as Element).querySelector('h1, h2, h3, h4');
    if (heading) {
      title = heading.textContent?.trim() || '';
    } else {
      // Try to get text from the link itself
      for (const link of links) {
        const href = (link as Element).getAttribute('href') || '';
        if (href.includes('regeringen.se')) {
          title = link.textContent?.trim() || '';
          break;
        }
      }
    }
    
    // If no title found, use the whole text but clean it up
    if (!title) {
      title = text.replace(inquiryCode, '').trim().substring(0, 200);
    }
    
    const ministry = extractMinistry(text);
    
    entries.push({
      inquiryCode,
      title: title || `Utredning ${inquiryCode}`,
      ministry,
      regeringenUrl,
      pageType,
    });
  }
  
  console.log(`Extracted ${entries.length} valid inquiry entries from ${pageType} page`);
  return entries;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse request body for options
    const { 
      pageTypes = ['avslutade'],
      maxPages = 100, // Safety limit
      startYear = 2023, // Only scrape from this year forward
    } = await req.json().catch(() => ({}));
    
    console.log(`Starting scrape with config: pageTypes=${pageTypes}, maxPages=${maxPages}, startYear=${startYear}`);
    
    const results = {
      processesCreated: 0,
      processesUpdated: 0,
      tasksCreated: 0,
      pagesProcessed: 0,
      totalEntriesScanned: 0,
      validEntriesProcessed: 0,
      stopReason: '', // 'year_threshold_reached', 'no_more_pages', 'max_pages_reached', 'error'
      errors: [] as string[],
      entries: [] as any[],
    };
    
    // Scrape each requested page type
    for (const pageType of pageTypes) {
      let currentPage = 1;
      let shouldContinue = true;
      let totalEntriesForPageType = 0;
      
      console.log(`\n=== Starting paginated scrape of ${pageType} ===`);
      
      while (shouldContinue && currentPage <= maxPages) {
        console.log(`\n--- Fetching ${pageType} page ${currentPage} ---`);
        
        const url = pageType === 'avslutade'
          ? `https://www.sou.gov.se/avslutade-utredningar/?page=${currentPage}`
          : `https://www.sou.gov.se/pagaende-utredningar/?page=${currentPage}`;
        
        try {
          // Fetch the page
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Vision-Connector-Tool/1.0 (Educational Research Tool)',
            },
          });
          
          if (!response.ok) {
            if (response.status === 404) {
              console.log(`Page ${currentPage} returned 404, stopping pagination (no_more_pages)`);
              results.stopReason = results.stopReason || 'no_more_pages';
              shouldContinue = false;
              break;
            }
            throw new Error(`HTTP ${response.status} from ${url}`);
          }
          
          const html = await response.text();
          const allEntries = parseInquiryList(html, pageType);
          results.totalEntriesScanned += allEntries.length;
          
          // Filter entries by year and check stop condition
          let oldestYearOnPage: number | null = null;
          const validEntries: InquiryEntry[] = [];
          
          for (const entry of allEntries) {
            const year = extractYearFromInquiryCode(entry.inquiryCode);
            
            if (year !== null) {
              if (oldestYearOnPage === null || year < oldestYearOnPage) {
                oldestYearOnPage = year;
              }
              
              // If we encounter a year below startYear, stop immediately
              if (year < startYear) {
                console.log(`⚠️  Stop condition reached: Found ${entry.inquiryCode} from year ${year} (< ${startYear})`);
                results.stopReason = results.stopReason || 'year_threshold_reached';
                shouldContinue = false;
                break;
              }
              
              validEntries.push(entry);
            } else {
              console.warn(`Could not extract year from ${entry.inquiryCode}, skipping`);
            }
          }
          
          console.log(`Page ${currentPage}: Found ${allEntries.length} total entries, ${validEntries.length} valid (>= ${startYear}), oldest year: ${oldestYearOnPage}`);
          
          // Process valid entries
          for (const entry of validEntries) {
            try {
              const processKey = normalizeProcessKey(entry.inquiryCode);
              
              // Determine initial stage based on page type
              const initialStage = pageType === 'avslutade' ? 'writing' : 'directive';
              const stageExplanation = pageType === 'avslutade'
                ? 'Investigation completed, awaiting SOU document fetch from regeringen.se'
                : 'Ongoing investigation with directive issued';
              
              // Upsert process
              const { data: process, error: processError } = await supabase
                .from('processes')
                .upsert({
                  process_key: processKey,
                  title: entry.title,
                  ministry: entry.ministry,
                  current_stage: initialStage,
                  stage_explanation: stageExplanation,
                  updated_at: new Date().toISOString(),
                }, {
                  onConflict: 'process_key',
                })
                .select()
                .single();
              
              if (processError) {
                console.error(`Error upserting process ${processKey}:`, processError);
                results.errors.push(`Process ${processKey}: ${processError.message}`);
                continue;
              }
              
              if (!process) {
                console.error(`No process returned for ${processKey}`);
                continue;
              }
              
              results.processesCreated++;
              
              // Check if we already have a pending task for this URL
              const { data: existingTask } = await supabase
                .from('agent_tasks')
                .select('id')
                .eq('process_id', process.id)
                .eq('task_type', 'fetch_regeringen_document')
                .in('status', ['pending', 'processing'])
                .maybeSingle();
              
              if (existingTask) {
                console.log(`Task already exists for process ${processKey}, skipping task creation`);
                continue;
              }
              
              // Create document fetch task
              const { error: taskError } = await supabase
                .from('agent_tasks')
                .insert({
                  task_type: 'fetch_regeringen_document',
                  agent_name: 'document_fetcher',
                  process_id: process.id,
                  input_data: {
                    regeringen_url: entry.regeringenUrl,
                    source_page: pageType,
                    inquiry_code: entry.inquiryCode,
                  },
                  status: 'pending',
                  priority: pageType === 'avslutade' ? 1 : 0,
                });
              
              if (taskError) {
                console.error(`Error creating task for ${processKey}:`, taskError);
                results.errors.push(`Task ${processKey}: ${taskError.message}`);
                continue;
              }
              
              results.tasksCreated++;
              results.validEntriesProcessed++;
              
              results.entries.push({
                processKey,
                inquiryCode: entry.inquiryCode,
                title: entry.title,
                ministry: entry.ministry,
                regeringenUrl: entry.regeringenUrl,
                stage: initialStage,
              });
              
            } catch (entryError) {
              const errorMsg = entryError instanceof Error ? entryError.message : String(entryError);
              console.error(`Error processing entry ${entry.inquiryCode}:`, entryError);
              results.errors.push(`Entry ${entry.inquiryCode}: ${errorMsg}`);
            }
            
            // Rate limiting: small delay between database operations
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          totalEntriesForPageType += validEntries.length;
          results.pagesProcessed++;
          
          // Check if there are more pages (only if we haven't hit stop condition)
          if (shouldContinue && !hasNextPage(html, currentPage)) {
            console.log(`No more pages detected after page ${currentPage}`);
            results.stopReason = results.stopReason || 'no_more_pages';
            shouldContinue = false;
          }
          
          // Check if we hit max pages
          if (shouldContinue && currentPage >= maxPages) {
            console.log(`Reached max pages limit (${maxPages})`);
            results.stopReason = results.stopReason || 'max_pages_reached';
            shouldContinue = false;
          }
          
          // Rate limiting between pages (1-2 seconds)
          if (shouldContinue) {
            const delay = 1000 + Math.random() * 1000; // 1-2 seconds
            console.log(`⏱️  Waiting ${Math.round(delay)}ms before next page...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          currentPage++;
          
        } catch (pageError) {
          const errorMsg = pageError instanceof Error ? pageError.message : String(pageError);
          console.error(`Error scraping ${pageType} page ${currentPage}:`, pageError);
          results.errors.push(`Page ${pageType}/${currentPage}: ${errorMsg}`);
          results.stopReason = results.stopReason || 'error';
          shouldContinue = false;
        }
      }
      
      console.log(`\n=== Completed ${pageType}: processed ${results.pagesProcessed} pages, ${totalEntriesForPageType} valid entries ===`);
    }
    
    console.log('\n=== Scraping complete ===');
    console.log(`Total pages processed: ${results.pagesProcessed}`);
    console.log(`Total entries scanned: ${results.totalEntriesScanned}`);
    console.log(`Valid entries processed: ${results.validEntriesProcessed}`);
    console.log(`Processes created: ${results.processesCreated}`);
    console.log(`Tasks created: ${results.tasksCreated}`);
    console.log(`Stop reason: ${results.stopReason}`);
    console.log(`Errors: ${results.errors.length}`);
    
    return new Response(
      JSON.stringify({
        success: true,
        ...results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Fatal error in scrape-sou-index:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMsg,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
