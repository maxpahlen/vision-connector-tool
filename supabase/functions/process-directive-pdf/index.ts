/**
 * Edge Function: process-directive-pdf
 * Phase 1.2: Extracts text from directive (Dir.) PDF files
 * 
 * Uses the shared PDF extractor service to extract text content from
 * directive PDFs and stores results in raw_content column.
 * 
 * Input: { document_id?: string, limit?: number, dry_run?: boolean }
 * Output: { processed, extracted, skipped, errors, details }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  getPdfExtractorConfig,
  extractTextFromPdf,
} from '../_shared/pdf-extractor.ts';
import { sanitizeText } from '../_shared/text-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessRequest {
  document_id?: string;
  limit?: number;
  dry_run?: boolean;
}

interface ProcessResult {
  processed: number;
  extracted: number;
  skipped: number;
  errors: Array<{ document_id: string; doc_number: string; error: string }>;
  details: Array<{
    document_id: string;
    doc_number: string;
    title: string;
    text_length: number;
    page_count?: number;
    extraction_status: string;
  }>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: ProcessRequest = await req.json().catch(() => ({}));
    const { document_id, limit = 10, dry_run = false } = body;

    console.log(`[process-directive-pdf] Starting - document_id: ${document_id}, limit: ${limit}, dry_run: ${dry_run}`);

    // Build query for directives needing extraction
    let query = supabase
      .from('documents')
      .select('id, doc_number, title, pdf_url, metadata')
      .eq('doc_type', 'directive')
      .not('pdf_url', 'is', null)
      .is('raw_content', null);

    if (document_id) {
      query = query.eq('id', document_id);
    }

    const { data: documents, error: fetchError } = await query.limit(limit);

    if (fetchError) {
      console.error('[process-directive-pdf] Fetch error:', fetchError);
      throw fetchError;
    }

    if (!documents || documents.length === 0) {
      return new Response(JSON.stringify({
        processed: 0,
        extracted: 0,
        skipped: 0,
        errors: [],
        details: [],
        message: 'No directive PDFs to process'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[process-directive-pdf] Found ${documents.length} directives to process`);

    // Get PDF extractor config
    const pdfConfig = getPdfExtractorConfig();

    const result: ProcessResult = {
      processed: 0,
      extracted: 0,
      skipped: 0,
      errors: [],
      details: []
    };

    for (const doc of documents) {
      try {
        console.log(`[process-directive-pdf] Processing ${doc.doc_number}: ${doc.title?.substring(0, 50)}...`);

        // Riksdagen URLs don't end with .pdf but are still PDFs
        // Format: https://data.riksdagen.se/fil/{UUID}
        const pdfUrlLower = doc.pdf_url?.toLowerCase() || '';
        const isRiksdagenPdf = pdfUrlLower.includes('data.riksdagen.se/fil/');
        const isRegeringenPdf = pdfUrlLower.includes('regeringen.se');
        const isPdfExtension = pdfUrlLower.endsWith('.pdf');
        
        if (!isRiksdagenPdf && !isRegeringenPdf && !isPdfExtension) {
          console.log(`[process-directive-pdf] Skipping non-PDF: ${doc.pdf_url}`);
          
          if (!dry_run) {
            await supabase
              .from('documents')
              .update({
                metadata: {
                  ...doc.metadata,
                  extraction_status: 'skipped',
                  extraction_skip_reason: 'Not a PDF file',
                  extraction_attempted_at: new Date().toISOString()
                }
              })
              .eq('id', doc.id);
          }
          
          result.skipped++;
          continue;
        }

        // Extract text from PDF
        const extractionResult = await extractTextFromPdf(pdfConfig, doc.pdf_url, {
          documentId: doc.id,
          docNumber: doc.doc_number,
        });

        if (!extractionResult.success) {
          console.error(`[process-directive-pdf] Extraction failed for ${doc.doc_number}: ${extractionResult.message}`);
          
          if (!dry_run) {
            await supabase
              .from('documents')
              .update({
                metadata: {
                  ...doc.metadata,
                  extraction_status: 'error',
                  extraction_error: extractionResult.error,
                  extraction_message: extractionResult.message,
                  extraction_attempted_at: new Date().toISOString()
                }
              })
              .eq('id', doc.id);
          }
          
          result.errors.push({
            document_id: doc.id,
            doc_number: doc.doc_number,
            error: extractionResult.message || 'PDF extraction failed'
          });
          continue;
        }

        // Sanitize extracted text
        const rawText = extractionResult.text || '';
        const sanitizedText = sanitizeText(rawText);

        if (!sanitizedText || sanitizedText.length < 100) {
          console.warn(`[process-directive-pdf] Empty or minimal text for ${doc.doc_number}`);
          
          if (!dry_run) {
            await supabase
              .from('documents')
              .update({
                raw_content: sanitizedText || null,
                metadata: {
                  ...doc.metadata,
                  extraction_status: 'error',
                  extraction_error: 'empty_content',
                  extraction_message: 'No meaningful text extracted',
                  text_length: sanitizedText?.length || 0,
                  page_count: extractionResult.metadata?.pageCount,
                  extraction_attempted_at: new Date().toISOString()
                }
              })
              .eq('id', doc.id);
          }
          
          result.errors.push({
            document_id: doc.id,
            doc_number: doc.doc_number,
            error: 'No meaningful text extracted'
          });
          continue;
        }

        console.log(`[process-directive-pdf] Extracted ${sanitizedText.length} chars for ${doc.doc_number}`);

        // Update with extracted content
        if (!dry_run) {
          const { error: updateError } = await supabase
            .from('documents')
            .update({
              raw_content: sanitizedText,
              processed_at: new Date().toISOString(),
              metadata: {
                ...doc.metadata,
                extraction_status: 'ok',
                text_length: sanitizedText.length,
                page_count: extractionResult.metadata?.pageCount,
                byte_size: extractionResult.metadata?.byteSize,
                extraction_completed_at: new Date().toISOString()
              }
            })
            .eq('id', doc.id);

          if (updateError) {
            console.error(`[process-directive-pdf] Update error for ${doc.doc_number}:`, updateError);
            result.errors.push({
              document_id: doc.id,
              doc_number: doc.doc_number,
              error: `Database update failed: ${updateError.message}`
            });
            continue;
          }
        }

        result.processed++;
        result.extracted++;
        result.details.push({
          document_id: doc.id,
          doc_number: doc.doc_number,
          title: doc.title,
          text_length: sanitizedText.length,
          page_count: extractionResult.metadata?.pageCount,
          extraction_status: 'ok'
        });

      } catch (err) {
        console.error(`[process-directive-pdf] Error processing ${doc.doc_number}:`, err);
        result.errors.push({
          document_id: doc.id,
          doc_number: doc.doc_number,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    console.log(`[process-directive-pdf] Complete - processed: ${result.processed}, extracted: ${result.extracted}, skipped: ${result.skipped}, errors: ${result.errors.length}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[process-directive-pdf] Fatal error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
