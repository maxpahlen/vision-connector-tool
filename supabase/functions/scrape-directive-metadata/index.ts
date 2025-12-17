import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DirectiveMetadata {
  directiveNumber: string;
  title: string;
  utredare: string | null;
  huvudsekreterare: string | null;
  sekreterare: string[];
  expert: string[];
  kommitte: string | null;
  kontaktperson: string | null;
  redovisningsdatum: string | null;
  regeringenUrl: string | null;
}

interface ParsedPerson {
  role: string;
  name: string;
}

// Normalize role keys for consistent storage
function normalizeRole(role: string): string {
  const roleLower = role.toLowerCase().trim();
  
  if (roleLower.includes('särskild utredare')) return 'sarskild_utredare';
  if (roleLower.includes('huvudsekreterare')) return 'huvudsekreterare';
  if (roleLower.includes('sekreterare')) return 'sekreterare';
  if (roleLower.includes('expert')) return 'expert';
  if (roleLower.includes('sakkunnig')) return 'sakkunnig';
  if (roleLower.includes('kontaktperson')) return 'kontaktperson';
  if (roleLower.includes('kommitté') || roleLower.includes('kommitte')) return 'kommitte';
  if (roleLower.includes('ordförande')) return 'ordforande';
  
  return role.toLowerCase().replace(/\s+/g, '_').replace(/[åä]/g, 'a').replace(/ö/g, 'o');
}

// Parse contact text to extract role-name pairs
function parseContactText(text: string): ParsedPerson[] {
  const persons: ParsedPerson[] = [];
  
  // Split by <br> tags or newlines
  const lines = text.split(/<br\s*\/?>/gi).map(l => l.trim()).filter(Boolean);
  
  for (const line of lines) {
    // Pattern: "Role: Name" or "Role Name" 
    const colonMatch = line.match(/^([^:]+):\s*(.+)$/);
    if (colonMatch) {
      const role = colonMatch[1].trim();
      const name = colonMatch[2].trim();
      if (name && name.length > 1 && !name.includes('http')) {
        persons.push({ role, name });
      }
    }
  }
  
  return persons;
}

// Parse accordion HTML to extract directive metadata
function parseAccordionItem(accordionHtml: string): DirectiveMetadata | null {
  const doc = new DOMParser().parseFromString(accordionHtml, 'text/html');
  if (!doc) return null;
  
  // Get title from button text
  const button = doc.querySelector('.c-accordion-plain__action, button');
  const titleText = button?.textContent?.trim() || '';
  
  // Extract directive number pattern like "U 2025:07" or "Ju 2025:20"
  const dirMatch = titleText.match(/^([A-Za-zÅÄÖåäö]{1,3}\s*\d{4}:\d+)/);
  const directiveNumber = dirMatch ? dirMatch[1].replace(/\s+/g, ' ') : '';
  
  // Extract title after the number
  const title = titleText.replace(/^[A-Za-zÅÄÖåäö]{1,3}\s*\d{4}:\d+\s*/, '').trim();
  
  const metadata: DirectiveMetadata = {
    directiveNumber,
    title,
    utredare: null,
    huvudsekreterare: null,
    sekreterare: [],
    expert: [],
    kommitte: null,
    kontaktperson: null,
    redovisningsdatum: null,
    regeringenUrl: null,
  };
  
  // Find Kontaktuppgifter section
  const rows = doc.querySelectorAll('.investigation-list-page-item__row');
  for (const row of rows) {
    const rowEl = row as unknown as Element;
    const heading = rowEl.querySelector('h2')?.textContent?.toLowerCase() || '';
    const content = rowEl.querySelector('.investigation-list-page-item__col:last-child p') as Element | null;
    
    if (heading.includes('kontaktuppgifter') && content) {
      const contentHtml = content.innerHTML || '';
      const persons = parseContactText(contentHtml);
      
      for (const person of persons) {
        const normalizedRole = normalizeRole(person.role);
        
        switch (normalizedRole) {
          case 'sarskild_utredare':
            metadata.utredare = person.name;
            break;
          case 'huvudsekreterare':
            metadata.huvudsekreterare = person.name;
            break;
          case 'sekreterare':
            metadata.sekreterare.push(person.name);
            break;
          case 'expert':
          case 'sakkunnig':
            metadata.expert.push(person.name);
            break;
          case 'kontaktperson':
            metadata.kontaktperson = person.name;
            break;
          case 'kommitte':
            metadata.kommitte = person.name;
            break;
          case 'ordforande':
            metadata.utredare = person.name; // Ordförande is often the lead
            break;
        }
      }
    }
    
    if (heading.includes('redovisningsdatum') && content) {
      metadata.redovisningsdatum = content.textContent?.trim() || null;
    }
  }
  
  // Find regeringen.se link
  const links = doc.querySelectorAll('.investigation-list-page-item__links a');
  for (const link of links) {
    const linkEl = link as unknown as Element;
    const href = linkEl.getAttribute('href') || '';
    if (href.includes('regeringen.se') && href.includes('kommittedirektiv')) {
      metadata.regeringenUrl = href.split('?')[0]; // Remove tracking params
      break;
    }
  }
  
  return metadata;
}

// Parse full page of directives
function parseDirectivePage(html: string): DirectiveMetadata[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) return [];
  
  const results: DirectiveMetadata[] = [];
  const accordions = doc.querySelectorAll('.c-accordion-plain');
  
  console.log(`Found ${accordions.length} accordion items`);
  
  for (const accordion of accordions) {
    const accordionEl = accordion as unknown as Element;
    const accordionHtml = accordionEl.outerHTML;
    const metadata = parseAccordionItem(accordionHtml);
    
    if (metadata && metadata.directiveNumber) {
      results.push(metadata);
      console.log(`Parsed: ${metadata.directiveNumber} - utredare: ${metadata.utredare}, sekreterare: ${metadata.sekreterare.length}`);
    }
  }
  
  return results;
}

// Convert directive number to doc_number format
function toDocNumber(directiveNumber: string): string {
  // "U 2025:07" -> "Dir. 2025:7"
  const match = directiveNumber.match(/[A-Za-zÅÄÖåäö]+\s*(\d{4}):(\d+)/);
  if (match) {
    const year = match[1];
    const num = parseInt(match[2], 10); // Remove leading zeros
    return `Dir. ${year}:${num}`;
  }
  return directiveNumber;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { page_type = 'pagaende', dry_run = false, limit } = await req.json();
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    // Determine URL based on page type
    const baseUrl = page_type === 'avslutade' 
      ? 'https://www.sou.gov.se/avslutade-utredningar/'
      : 'https://www.sou.gov.se/pagaende-utredningar/';
    
    console.log(`Fetching ${page_type} directives from: ${baseUrl}`);
    
    const response = await fetch(baseUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LovableScraper/1.0)',
        'Accept': 'text/html',
      },
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch page: ${response.status}`);
    }
    
    const html = await response.text();
    let directives = parseDirectivePage(html);
    
    if (limit && limit > 0) {
      directives = directives.slice(0, limit);
    }
    
    console.log(`Parsed ${directives.length} directives`);
    
    // Match to existing documents and update metadata
    const results = {
      total: directives.length,
      matched: 0,
      updated: 0,
      not_found: [] as string[],
      details: [] as any[],
    };
    
    for (const directive of directives) {
      const docNumber = toDocNumber(directive.directiveNumber);
      
      // Find matching document
      const { data: docs, error: findError } = await supabase
        .from('documents')
        .select('id, doc_number, metadata')
        .eq('doc_type', 'directive')
        .ilike('doc_number', `%${docNumber.replace('Dir. ', '')}%`)
        .limit(1);
      
      if (findError) {
        console.error(`Error finding ${docNumber}:`, findError);
        continue;
      }
      
      const detail: any = {
        directiveNumber: directive.directiveNumber,
        docNumber,
        utredare: directive.utredare,
        sekreterare: directive.sekreterare,
        redovisningsdatum: directive.redovisningsdatum,
        matched: false,
        updated: false,
      };
      
      if (docs && docs.length > 0) {
        const doc = docs[0];
        results.matched++;
        detail.matched = true;
        detail.documentId = doc.id;
        
        if (!dry_run) {
          // Merge new metadata with existing
          const existingMetadata = doc.metadata || {};
          const newMetadata = {
            ...existingMetadata,
            accordion_source: 'sou.gov.se',
            accordion_scraped_at: new Date().toISOString(),
            utredare: directive.utredare,
            huvudsekreterare: directive.huvudsekreterare,
            sekreterare: directive.sekreterare,
            expert: directive.expert,
            kommitte: directive.kommitte,
            kontaktperson: directive.kontaktperson,
            redovisningsdatum: directive.redovisningsdatum,
            sou_gov_se_title: directive.title,
          };
          
          const { error: updateError } = await supabase
            .from('documents')
            .update({ metadata: newMetadata })
            .eq('id', doc.id);
          
          if (!updateError) {
            results.updated++;
            detail.updated = true;
          } else {
            console.error(`Error updating ${doc.id}:`, updateError);
          }
          
          // Also create entities for the people
          if (directive.utredare) {
            await supabase.from('entities').upsert({
              name: directive.utredare,
              entity_type: 'person',
              role: 'särskild utredare',
              source_document_id: doc.id,
              source_excerpt: `Kontaktuppgifter från sou.gov.se: Särskild utredare: ${directive.utredare}`,
              metadata: { source_type: 'html_accordion', page_type }
            }, { onConflict: 'name,entity_type,source_document_id' });
          }
          
          for (const sekr of directive.sekreterare) {
            await supabase.from('entities').upsert({
              name: sekr,
              entity_type: 'person',
              role: 'sekreterare',
              source_document_id: doc.id,
              source_excerpt: `Kontaktuppgifter från sou.gov.se: Sekreterare: ${sekr}`,
              metadata: { source_type: 'html_accordion', page_type }
            }, { onConflict: 'name,entity_type,source_document_id' });
          }
          
          if (directive.huvudsekreterare) {
            await supabase.from('entities').upsert({
              name: directive.huvudsekreterare,
              entity_type: 'person',
              role: 'huvudsekreterare',
              source_document_id: doc.id,
              source_excerpt: `Kontaktuppgifter från sou.gov.se: Huvudsekreterare: ${directive.huvudsekreterare}`,
              metadata: { source_type: 'html_accordion', page_type }
            }, { onConflict: 'name,entity_type,source_document_id' });
          }
        }
      } else {
        results.not_found.push(docNumber);
      }
      
      results.details.push(detail);
    }
    
    return new Response(JSON.stringify({
      success: true,
      page_type,
      dry_run,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
