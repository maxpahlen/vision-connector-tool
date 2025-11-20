import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { DOMParser } from 'https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { 
  detectDocumentType, 
  extractMinistry, 
  extractTitle, 
  extractPublicationDate 
} from '../_shared/html-parser.ts';
import { 
  extractAndScorePdfs,
  type PdfCandidate
} from '../_shared/pdf-scorer.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Input validation schema
const RequestSchema = z.object({
  url: z.string().url().refine(
    (url) => url.startsWith('https://www.regeringen.se/') || url.startsWith('https://regeringen.se/'),
    { message: 'URL must be from regeringen.se domain' }
  ).optional(),
  regeringen_url: z.string().url().refine(
    (url) => url.startsWith('https://www.regeringen.se/') || url.startsWith('https://regeringen.se/'),
    { message: 'URL must be from regeringen.se domain' }
  ).optional(),
  task_id: z.string().uuid().optional(),
  process_id: z.string().uuid().optional(),
}).refine(
  (data) => data.url || data.regeringen_url,
  { message: 'Either url or regeringen_url must be provided' }
);

interface DocumentMetadata {
  docType: 'sou' | 'directive' | 'ds' | 'unknown';
  docNumber: string;
  title: string;
  publicationDate: string | null;
  ministry: string;
  pdfUrl: string | null;
  url: string;
  pdf_status: 'found' | 'missing' | 'multiple_candidates' | 'extraction_failed';
  pdf_confidence_score: number;
  pdf_reasoning: string[];
  pdf_candidates: PdfCandidate[];
  extraction_log: string[];
  html_snapshot?: string;
  last_extraction_attempt: string;
}

function parseRegeringenDocument(html: string, url: string): DocumentMetadata {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) {
    throw new Error('Failed to parse HTML');
  }
  
  const docTypeInfo = detectDocumentType(html, doc);
  const docNumber = docTypeInfo?.number || '';
  const docType = docTypeInfo?.type || 'unknown';
  
  const pdfResult = extractAndScorePdfs(doc, docType, docNumber);
  
  return {
    docType: (docType as 'sou' | 'directive' | 'ds') || 'unknown',
    docNumber,
    title: extractTitle(doc),
    publicationDate: extractPublicationDate(doc),
    ministry: extractMinistry(doc),
    pdfUrl: pdfResult.bestPdf,
    url,
    pdf_status: pdfResult.bestPdf ? 'found' : 'missing',
    pdf_confidence_score: pdfResult.confidence,
    pdf_reasoning: pdfResult.reasoning,
    pdf_candidates: pdfResult.allCandidates,
    extraction_log: pdfResult.extractionLog,
    html_snapshot: pdfResult.htmlSnapshot || undefined,
    last_extraction_attempt: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const body = await req.json();
    const validationResult = RequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid request body',
          details: validationResult.error.issues 
        }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { task_id, regeringen_url, process_id, url } = validationResult.data;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const documentUrl = regeringen_url || url;
    
    if (!documentUrl) {
      throw new Error('Missing required parameter: regeringen_url or url');
    }
    
    console.log(`Scraping document: ${documentUrl}${process_id ? ` for process ${process_id}` : ' (standalone test)'}`);
    
    const response = await fetch(documentUrl, {
      headers: {
        'User-Agent': 'Vision-Connector-Tool/1.0 (Educational Research Tool)',
      },
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} from ${documentUrl}`);
    }
    
    const html = await response.text();
    const metadata = parseRegeringenDocument(html, documentUrl);
    
    console.log('Extracted metadata:', metadata);
    
    if (metadata.docType === 'unknown' || !metadata.docNumber) {
      throw new Error('Could not detect document type or number');
    }
    
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
          metadata: {
            pdf_status: metadata.pdf_status,
            pdf_confidence_score: metadata.pdf_confidence_score,
            pdf_reasoning: metadata.pdf_reasoning,
            pdf_candidates: metadata.pdf_candidates,
            extraction_log: metadata.extraction_log,
            html_snapshot: metadata.html_snapshot,
            last_extraction_attempt: metadata.last_extraction_attempt,
          },
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
          metadata: {
            pdf_status: metadata.pdf_status,
            pdf_confidence_score: metadata.pdf_confidence_score,
            pdf_reasoning: metadata.pdf_reasoning,
            pdf_candidates: metadata.pdf_candidates,
            extraction_log: metadata.extraction_log,
            html_snapshot: metadata.html_snapshot,
            last_extraction_attempt: metadata.last_extraction_attempt,
          },
        })
        .select()
        .single();
      
      if (insertError) throw insertError;
      documentId = newDoc.id;
    }
    
    const role = metadata.docType === 'sou' ? 'main_sou' : 
                 metadata.docType === 'directive' ? 'directive' : 
                 'reference_ds';
    
    if (process_id) {
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
      
      if (metadata.docType === 'sou') {
        console.log(`SOU detected! Updating process stage to 'published'...`);
        
        const { error: updateProcessError } = await supabase
          .from('processes')
          .update({
            current_stage: 'published',
            stage_explanation: `SOU ${metadata.docNumber} has been published`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', process_id);
        
        if (updateProcessError) {
          console.error('Error updating process stage:', updateProcessError);
        }
      }
      
      if (metadata.docType === 'directive') {
        console.log(`Directive detected! Updating process stage...`);
        
        const { error: updateProcessError } = await supabase
          .from('processes')
          .update({
            current_stage: 'directive_issued',
            stage_explanation: `Directive ${metadata.docNumber} has been issued`,
            directive_number: metadata.docNumber,
            updated_at: new Date().toISOString(),
          })
          .eq('id', process_id);
        
        if (updateProcessError) {
          console.error('Error updating process stage:', updateProcessError);
        }
      }
    }
    
    if (metadata.pdfUrl && metadata.pdf_confidence_score >= 40) {
      console.log(`PDF found with ${metadata.pdf_confidence_score}% confidence. Creating process_pdf task...`);
      
      const { error: taskError } = await supabase
        .from('agent_tasks')
        .insert({
          task_type: 'process_pdf',
          agent_name: 'pdf_processor',
          status: 'pending',
          process_id: process_id || null,
          document_id: documentId,
          priority: metadata.pdf_confidence_score >= 70 ? 1 : 2,
          input_data: {
            pdf_url: metadata.pdfUrl,
            doc_number: metadata.docNumber,
            confidence_score: metadata.pdf_confidence_score,
          },
        });
      
      if (taskError) {
        console.error('Error creating PDF task:', taskError);
      } else {
        console.log('PDF processing task created successfully');
      }
    } else if (!metadata.pdfUrl) {
      console.log('No PDF found for this document');
    } else {
      console.log(`PDF confidence too low (${metadata.pdf_confidence_score}%), skipping processing`);
    }
    
    if (task_id) {
      const { error: taskUpdateError } = await supabase
        .from('agent_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          output_data: {
            document_id: documentId,
            doc_number: metadata.docNumber,
            doc_type: metadata.docType,
            pdf_found: !!metadata.pdfUrl,
            pdf_confidence: metadata.pdf_confidence_score,
          },
        })
        .eq('id', task_id);
      
      if (taskUpdateError) {
        console.error('Error updating task status:', taskUpdateError);
      }
    }
    
    return new Response(
      JSON.stringify({
        success: true,
        document_id: documentId,
        doc_number: metadata.docNumber,
        doc_type: metadata.docType,
        pdf_url: metadata.pdfUrl,
        pdf_confidence: metadata.pdf_confidence_score,
        pdf_status: metadata.pdf_status,
        metadata,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
    
  } catch (error) {
    console.error('Error in scrape-regeringen-document:', error);
    
    const body = await req.json().catch(() => ({}));
    const task_id = body?.task_id;
    
    if (task_id) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      await supabase
        .from('agent_tasks')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : String(error),
          completed_at: new Date().toISOString(),
        })
        .eq('id', task_id);
    }
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'An error occurred',
        details: error instanceof Error ? error.stack : String(error)
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
