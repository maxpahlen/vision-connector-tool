import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DOMParser, Element, Document } from 'https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DocumentMetadata {
  docType: 'sou' | 'directive' | 'ds' | 'unknown';
  docNumber: string;
  title: string;
  publicationDate: string | null;
  ministry: string;
  pdfUrl: string | null;
  url: string;
}

// Detect document type from HTML content
function detectDocumentType(html: string, doc: Document): { type: string; number: string } | null {
  const text = html.toLowerCase();
  
  // Check for SOU (highest priority for completed investigations)
  const souVignette = doc.querySelector('.h1-vignette');
  if (souVignette && /sou\s+\d{4}:\d+/i.test(souVignette.textContent || '')) {
    const match = souVignette.textContent?.match(/SOU\s+(\d{4}:\d+)/i);
    if (match) return { type: 'sou', number: `SOU ${match[1]}` };
  }
  
  // Fallback: check in text
  if (text.includes('statens offentliga utredningar') || /sou\s+\d{4}:\d+/.test(text)) {
    const match = html.match(/SOU\s+(\d{4}:\d+)/i);
    if (match) return { type: 'sou', number: `SOU ${match[1]}` };
  }
  
  // Check for Directive
  if (text.includes('kommittédirektiv') || /dir\.\s+\d{4}:\d+/.test(text)) {
    const match = html.match(/Dir\.\s+(\d{4}:\d+)/i);
    if (match) return { type: 'directive', number: `Dir. ${match[1]}` };
  }
  
  // Check for Ds
  if (text.includes('departementsserien') || /ds\s+\d{4}:\d+/.test(text)) {
    const match = html.match(/Ds\s+(\d{4}:\d+)/i);
    if (match) return { type: 'ds', number: `Ds ${match[1]}` };
  }
  
  return null;
}

// Extract ministry from page
function extractMinistry(doc: Document): string {
  const categoryText = doc.querySelector('.categories-text');
  if (categoryText) {
    const text = categoryText.textContent || '';
    
    // Common ministry patterns
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
    
    // Return the whole text if no exact match
    return text.trim();
  }
  
  return 'Okänt departement';
}

// Extract title from page
function extractTitle(doc: Document): string {
  const h1 = doc.querySelector('h1#h1id, h1');
  if (h1) {
    // Remove the vignette span if present
    const vignette = h1.querySelector('.h1-vignette');
    if (vignette) {
      vignette.remove();
    }
    return h1.textContent?.trim() || '';
  }
  return '';
}

// Extract publication date
function parseSwedishDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  const monthMap: Record<string, string> = {
    'januari': '01', 'februari': '02', 'mars': '03', 'april': '04',
    'maj': '05', 'juni': '06', 'juli': '07', 'augusti': '08',
    'september': '09', 'oktober': '10', 'november': '11', 'december': '12'
  };
  
  // Match "12 maj 2025" format
  const match = dateStr.match(/(\d{1,2})\s+([a-zåäö]+)\s+(\d{4})/i);
  if (match) {
    const [, day, month, year] = match;
    const monthNum = monthMap[month.toLowerCase()];
    if (monthNum) {
      return `${year}-${monthNum}-${day.padStart(2, '0')}`;
    }
  }
  
  return null;
}

function extractPublicationDate(doc: Document): string | null {
  const timeElement = doc.querySelector('.published time');
  if (timeElement) {
    const datetime = timeElement.getAttribute('datetime');
    if (datetime) {
      return parseSwedishDate(datetime);
    }
  }
  return null;
}

// Extract PDF URL
function extractPdfUrl(doc: Document, baseUrl: string): string | null {
  // Look for PDF links in the download section
  const pdfLinks = Array.from(doc.querySelectorAll('a[href*=".pdf"]'));
  
  if (pdfLinks.length === 0) return null;
  
  // Prefer links in the "Ladda ner" section
  const downloadSection = doc.querySelector('.list--icons');
  if (downloadSection) {
    const link = downloadSection.querySelector('a[href*=".pdf"]');
    if (link) {
      const href = (link as Element).getAttribute('href');
      if (href) {
        return href.startsWith('http') ? href : new URL(href, baseUrl).toString();
      }
    }
  }
  
  // Fallback: use first PDF link found
  const href = (pdfLinks[0] as Element).getAttribute('href');
  if (!href) return null;
  
  return href.startsWith('http') ? href : new URL(href, baseUrl).toString();
}

// Parse HTML page and extract metadata
function parseRegeringenDocument(html: string, url: string): DocumentMetadata {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) {
    throw new Error('Failed to parse HTML');
  }
  
  const docTypeInfo = detectDocumentType(html, doc);
  
  return {
    docType: (docTypeInfo?.type as 'sou' | 'directive' | 'ds') || 'unknown',
    docNumber: docTypeInfo?.number || '',
    title: extractTitle(doc),
    publicationDate: extractPublicationDate(doc),
    ministry: extractMinistry(doc),
    pdfUrl: extractPdfUrl(doc, url),
    url,
  };
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
    
    const { task_id, regeringen_url, process_id } = await req.json();
    
    if (!regeringen_url || !process_id) {
      throw new Error('Missing required parameters: regeringen_url and process_id');
    }
    
    console.log(`Scraping document: ${regeringen_url} for process ${process_id}`);
    
    // Fetch the page
    const response = await fetch(regeringen_url, {
      headers: {
        'User-Agent': 'Vision-Connector-Tool/1.0 (Educational Research Tool)',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${regeringen_url}`);
    }
    
    const html = await response.text();
    const metadata = parseRegeringenDocument(html, regeringen_url);
    
    console.log('Extracted metadata:', metadata);
    
    if (metadata.docType === 'unknown' || !metadata.docNumber) {
      throw new Error('Could not detect document type or number');
    }
    
    // Check if document already exists
    const { data: existingDoc } = await supabase
      .from('documents')
      .select('id')
      .eq('doc_number', metadata.docNumber)
      .maybeSingle();
    
    let documentId: string;
    
    if (existingDoc) {
      console.log(`Document ${metadata.docNumber} already exists, updating...`);
      
      const { data: updatedDoc, error: updateError } = await supabase
        .from('documents')
        .update({
          title: metadata.title,
          url: metadata.url,
          pdf_url: metadata.pdfUrl,
          publication_date: metadata.publicationDate,
          ministry: metadata.ministry,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingDoc.id)
        .select()
        .single();
      
      if (updateError) throw updateError;
      documentId = updatedDoc.id;
      
    } else {
      console.log(`Creating new document ${metadata.docNumber}...`);
      
      const { data: newDoc, error: insertError } = await supabase
        .from('documents')
        .insert({
          doc_type: metadata.docType,
          doc_number: metadata.docNumber,
          title: metadata.title,
          url: metadata.url,
          pdf_url: metadata.pdfUrl,
          publication_date: metadata.publicationDate,
          ministry: metadata.ministry,
        })
        .select()
        .single();
      
      if (insertError) throw insertError;
      documentId = newDoc.id;
    }
    
    // Determine role based on document type
    const role = metadata.docType === 'sou' ? 'main_sou' : 
                 metadata.docType === 'directive' ? 'directive' : 
                 'reference_ds';
    
    // Link document to process
    const { error: linkError } = await supabase
      .from('process_documents')
      .upsert({
        process_id,
        document_id: documentId,
        role,
      }, {
        onConflict: 'process_id,document_id',
      });
    
    if (linkError) {
      console.error('Error linking document to process:', linkError);
    }
    
    // Update process stage if SOU
    if (metadata.docType === 'sou') {
      console.log(`SOU detected! Updating process stage to 'published'...`);
      
      const { error: processError } = await supabase
        .from('processes')
        .update({
          current_stage: 'published',
          stage_explanation: `${metadata.docNumber} published${metadata.pdfUrl ? ' with PDF available' : ''}`,
          main_document_id: documentId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', process_id);
      
      if (processError) {
        console.error('Error updating process stage:', processError);
      }
    } else {
      // Update stage explanation for other document types
      const { error: processError } = await supabase
        .from('processes')
        .update({
          stage_explanation: `${metadata.docType.toUpperCase()} ${metadata.docNumber} found`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', process_id);
      
      if (processError) {
        console.error('Error updating process explanation:', processError);
      }
    }
    
    // Create PDF processing task if PDF URL exists
    if (metadata.pdfUrl) {
      console.log('Creating PDF processing task...');
      
      const { error: taskError } = await supabase
        .from('agent_tasks')
        .insert({
          task_type: 'process_pdf',
          agent_name: 'pdf_processor',
          document_id: documentId,
          input_data: {
            pdf_url: metadata.pdfUrl,
            doc_number: metadata.docNumber,
          },
          status: 'pending',
          priority: metadata.docType === 'sou' ? 2 : 1,
        });
      
      if (taskError) {
        console.error('Error creating PDF task:', taskError);
      }
    }
    
    // Update original task status if task_id provided
    if (task_id) {
      await supabase
        .from('agent_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          output_data: {
            document_id: documentId,
            doc_type: metadata.docType,
            doc_number: metadata.docNumber,
          },
        })
        .eq('id', task_id);
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        document_id: documentId,
        doc_type: metadata.docType,
        doc_number: metadata.docNumber,
        title: metadata.title,
        pdf_url: metadata.pdfUrl,
        stage_updated: metadata.docType === 'sou',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Error in scrape-regeringen-document:', error);
    
    // Update task status to failed if task_id provided
    const body = await req.json().catch(() => ({}));
    if (body.task_id) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        
        await supabase
          .from('agent_tasks')
          .update({
            status: 'failed',
            error_message: errorMsg,
            completed_at: new Date().toISOString(),
          })
          .eq('id', body.task_id);
      } catch (updateError) {
        console.error('Error updating task status:', updateError);
      }
    }
    
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
