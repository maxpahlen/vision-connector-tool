import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Proposition Index Scraper
 * 
 * Scrapes propositions (regeringens propositioner) from regeringen.se
 * Part of Phase 5: Legislative Graph Expansion
 */

interface PropositionMetadata {
  title: string;
  docNumber: string;  // e.g., "Prop. 2024/25:123"
  url: string;
  pdfUrl?: string;
  ministry?: string;
  publicationDate?: string;
}

interface ScrapeResult {
  propositions: PropositionMetadata[];
  page: number;
  hasMore: boolean;
  errors: string[];
}

/**
 * Parse a proposition listing page
 */
function parsePropositionList(html: string, baseUrl: string): PropositionMetadata[] {
  const propositions: PropositionMetadata[] = [];
  
  // Pattern for proposition items on regeringen.se
  // Structure varies, so we use multiple patterns
  const itemPatterns = [
    // Standard list item pattern
    /<article[^>]*class="[^"]*content-item[^"]*"[^>]*>([\s\S]*?)<\/article>/gi,
    // Alternative card pattern
    /<div[^>]*class="[^"]*document-card[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    // List item pattern
    /<li[^>]*class="[^"]*search-result[^"]*"[^>]*>([\s\S]*?)<\/li>/gi
  ];
  
  for (const pattern of itemPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const itemHtml = match[1];
      
      // Extract title and URL
      const titleMatch = itemHtml.match(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
      if (!titleMatch) continue;
      
      const url = titleMatch[1].startsWith('http') 
        ? titleMatch[1] 
        : `${baseUrl}${titleMatch[1]}`;
      const title = titleMatch[2].trim();
      
      // Extract document number (Prop. YYYY/YY:NNN)
      const docNumMatch = itemHtml.match(/Prop\.?\s*(\d{4}\/\d{2}:\d+)/i) 
        || title.match(/Prop\.?\s*(\d{4}\/\d{2}:\d+)/i);
      
      if (!docNumMatch) continue; // Skip if no valid prop number
      
      const docNumber = `Prop. ${docNumMatch[1]}`;
      
      // Extract ministry if available
      const ministryMatch = itemHtml.match(/(?:Från|Ministry|Departement):\s*([^<]+)/i);
      const ministry = ministryMatch ? ministryMatch[1].trim() : undefined;
      
      // Extract date if available
      const dateMatch = itemHtml.match(/(\d{4}-\d{2}-\d{2})/);
      const publicationDate = dateMatch ? dateMatch[1] : undefined;
      
      propositions.push({
        title,
        docNumber,
        url,
        ministry,
        publicationDate
      });
    }
    
    // If we found items with one pattern, don't try others
    if (propositions.length > 0) break;
  }
  
  return propositions;
}

/**
 * Extract PDF URL from proposition detail page
 */
function extractPdfUrl(html: string): string | undefined {
  // Look for PDF links
  const pdfPatterns = [
    /href="([^"]+\.pdf)"/i,
    /href="([^"]+\/pdf\/[^"]+)"/i,
    /data-pdf-url="([^"]+)"/i
  ];
  
  for (const pattern of pdfPatterns) {
    const match = html.match(pattern);
    if (match) {
      return match[1].startsWith('http') 
        ? match[1] 
        : `https://www.regeringen.se${match[1]}`;
    }
  }
  
  return undefined;
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
    const { page = 1, limit = 20, year } = await req.json().catch(() => ({}));
    
    console.log('[Proposition Scraper] Starting', { page, limit, year });
    
    // Build URL for proposition listing
    const baseUrl = 'https://www.regeringen.se';
    let listUrl = `${baseUrl}/propositioner/`;
    
    if (year) {
      listUrl += `?year=${year}`;
    }
    if (page > 1) {
      listUrl += `${year ? '&' : '?'}page=${page}`;
    }
    
    console.log('[Proposition Scraper] Fetching', { url: listUrl });
    
    // Fetch proposition listing page
    const listResponse = await fetch(listUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LegislativeBot/1.0; +https://example.com/bot)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'sv-SE,sv;q=0.9,en;q=0.8'
      }
    });
    
    if (!listResponse.ok) {
      throw new Error(`Failed to fetch proposition list: ${listResponse.status}`);
    }
    
    const listHtml = await listResponse.text();
    const propositions = parsePropositionList(listHtml, baseUrl);
    
    console.log('[Proposition Scraper] Found propositions', { count: propositions.length });
    
    // Check for pagination ("next" link)
    const hasMore = listHtml.includes('rel="next"') || listHtml.includes('class="next"');
    
    const result: ScrapeResult = {
      propositions: [],
      page,
      hasMore,
      errors: []
    };
    
    // Process each proposition (limited)
    const toProcess = propositions.slice(0, limit);
    
    for (const prop of toProcess) {
      try {
        // Check if already exists
        const { data: existing } = await supabase
          .from('documents')
          .select('id')
          .eq('doc_number', prop.docNumber)
          .maybeSingle();
        
        if (existing) {
          console.log('[Proposition Scraper] Skipping existing', { docNumber: prop.docNumber });
          continue;
        }
        
        // Fetch detail page for PDF URL
        console.log('[Proposition Scraper] Fetching detail page', { url: prop.url });
        
        const detailResponse = await fetch(prop.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; LegislativeBot/1.0)',
            'Accept': 'text/html'
          }
        });
        
        if (detailResponse.ok) {
          const detailHtml = await detailResponse.text();
          prop.pdfUrl = extractPdfUrl(detailHtml);
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
              scraper_version: '5.0.0'
            }
          })
          .select()
          .single();
        
        if (insertError) {
          console.error('[Proposition Scraper] Insert error', { 
            docNumber: prop.docNumber, 
            error: insertError.message 
          });
          result.errors.push(`Failed to insert ${prop.docNumber}: ${insertError.message}`);
          continue;
        }
        
        result.propositions.push(prop);
        
        console.log('[Proposition Scraper] ✅ Inserted', { 
          id: insertedDoc.id,
          docNumber: prop.docNumber 
        });
        
        // Rate limiting - be nice to the server
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (propError) {
        const errorMsg = propError instanceof Error ? propError.message : 'Unknown error';
        console.error('[Proposition Scraper] Error processing', { 
          docNumber: prop.docNumber, 
          error: errorMsg 
        });
        result.errors.push(`Error processing ${prop.docNumber}: ${errorMsg}`);
      }
    }
    
    console.log('[Proposition Scraper] Complete', { 
      inserted: result.propositions.length,
      errors: result.errors.length,
      hasMore 
    });
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('[Proposition Scraper] ❌ Error:', error);
    
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
