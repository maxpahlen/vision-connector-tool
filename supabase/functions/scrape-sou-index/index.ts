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
    const { pageTypes = ['avslutade'] } = await req.json().catch(() => ({}));
    
    const results = {
      processesCreated: 0,
      processesUpdated: 0,
      tasksCreated: 0,
      errors: [] as string[],
      entries: [] as any[],
    };
    
    // Scrape each requested page type
    for (const pageType of pageTypes) {
      console.log(`Starting scrape of ${pageType} page...`);
      
      const url = pageType === 'avslutade'
        ? 'https://www.sou.gov.se/avslutade-utredningar/'
        : 'https://www.sou.gov.se/pagaende-utredningar/';
      
      try {
        // Fetch the page
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Vision-Connector-Tool/1.0 (Educational Research Tool)',
          },
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} from ${url}`);
        }
        
        const html = await response.text();
        const entries = parseInquiryList(html, pageType);
        
        console.log(`Processing ${entries.length} entries from ${pageType}...`);
        
        // Process each entry
        for (const entry of entries) {
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
                priority: pageType === 'avslutade' ? 1 : 0, // Prioritize completed investigations
              });
            
            if (taskError) {
              console.error(`Error creating task for ${processKey}:`, taskError);
              results.errors.push(`Task ${processKey}: ${taskError.message}`);
              continue;
            }
            
            results.tasksCreated++;
            
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
        
      } catch (pageError) {
        const errorMsg = pageError instanceof Error ? pageError.message : String(pageError);
        console.error(`Error scraping ${pageType} page:`, pageError);
        results.errors.push(`Page ${pageType}: ${errorMsg}`);
      }
    }
    
    console.log('Scraping complete:', results);
    
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
