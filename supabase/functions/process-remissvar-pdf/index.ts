/**
 * Edge Function: process-remissvar-pdf
 * Phase 5.6.2: Extracts text from remissvar PDF files
 * 
 * Uses the shared PDF extractor service to extract text content from
 * remiss_responses PDFs and stores results in raw_content column.
 * 
 * Input: { response_id?: string, limit?: number, dry_run?: boolean }
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
  response_id?: string;
  remiss_id?: string;
  limit?: number;
  dry_run?: boolean;
}

interface ProcessResult {
  processed: number;
  extracted: number;
  skipped: number;
  errors: Array<{ response_id: string; error: string }>;
  details: Array<{
    response_id: string;
    filename: string | null;
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
    const { response_id, remiss_id, limit = 10, dry_run = false } = body;

    console.log(`[process-remissvar-pdf] Starting - response_id: ${response_id}, remiss_id: ${remiss_id}, limit: ${limit}, dry_run: ${dry_run}`);

    // Build query for remiss_responses needing extraction
    let query = supabase
      .from('remiss_responses')
      .select('id, remiss_id, file_url, filename, file_type, responding_organization, metadata')
      .eq('extraction_status', 'not_started')
      .eq('file_type', 'pdf')
      .not('file_url', 'is', null);

    if (response_id) {
      query = query.eq('id', response_id);
    } else if (remiss_id) {
      query = query.eq('remiss_id', remiss_id);
    }

    const { data: responses, error: fetchError } = await query.limit(limit);

    if (fetchError) {
      console.error('[process-remissvar-pdf] Fetch error:', fetchError);
      throw fetchError;
    }

    if (!responses || responses.length === 0) {
      return new Response(JSON.stringify({
        processed: 0,
        extracted: 0,
        skipped: 0,
        errors: [],
        details: [],
        message: 'No remissvar PDFs to process'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[process-remissvar-pdf] Found ${responses.length} remissvar PDFs to process`);

    // Get PDF extractor config
    const pdfConfig = getPdfExtractorConfig();

    const result: ProcessResult = {
      processed: 0,
      extracted: 0,
      skipped: 0,
      errors: [],
      details: []
    };

    for (const response of responses) {
      try {
        console.log(`[process-remissvar-pdf] Processing response ${response.id}: ${response.filename || response.file_url}`);

        // Skip non-PDF files (belt-and-braces check)
        const fileUrlLower = response.file_url.toLowerCase();
        if (!fileUrlLower.endsWith('.pdf') && response.file_type !== 'pdf') {
          console.log(`[process-remissvar-pdf] Skipping non-PDF: ${response.file_url}`);
          
          if (!dry_run) {
            await supabase
              .from('remiss_responses')
              .update({
                extraction_status: 'skipped',
                metadata: {
                  ...response.metadata,
                  extraction_skip_reason: 'Not a PDF file',
                  extraction_attempted_at: new Date().toISOString()
                }
              })
              .eq('id', response.id);
          }
          
          result.skipped++;
          continue;
        }

        // Extract text from PDF
        const extractionResult = await extractTextFromPdf(pdfConfig, response.file_url, {
          documentId: response.id,
        });

        if (!extractionResult.success) {
          console.error(`[process-remissvar-pdf] Extraction failed for ${response.id}: ${extractionResult.message}`);
          
          if (!dry_run) {
            await supabase
              .from('remiss_responses')
              .update({
                extraction_status: 'error',
                extracted_at: new Date().toISOString(),
                metadata: {
                  ...response.metadata,
                  extraction_error: extractionResult.error,
                  extraction_message: extractionResult.message,
                  extraction_attempted_at: new Date().toISOString()
                }
              })
              .eq('id', response.id);
          }
          
          result.errors.push({
            response_id: response.id,
            error: extractionResult.message || 'PDF extraction failed'
          });
          continue;
        }

        // Sanitize extracted text
        const rawText = extractionResult.text || '';
        const sanitizedText = sanitizeText(rawText);

        if (!sanitizedText || sanitizedText.length < 10) {
          console.warn(`[process-remissvar-pdf] Empty or minimal text for ${response.id}`);
          
          if (!dry_run) {
            await supabase
              .from('remiss_responses')
              .update({
                extraction_status: 'error',
                extracted_at: new Date().toISOString(),
                raw_content: sanitizedText || null,
                metadata: {
                  ...response.metadata,
                  extraction_error: 'empty_content',
                  extraction_message: 'No meaningful text extracted',
                  text_length: sanitizedText?.length || 0,
                  page_count: extractionResult.metadata?.pageCount,
                  extraction_attempted_at: new Date().toISOString()
                }
              })
              .eq('id', response.id);
          }
          
          result.errors.push({
            response_id: response.id,
            error: 'No meaningful text extracted'
          });
          continue;
        }

        console.log(`[process-remissvar-pdf] Extracted ${sanitizedText.length} chars for ${response.id}`);

        // Update with extracted content
        if (!dry_run) {
          const { error: updateError } = await supabase
            .from('remiss_responses')
            .update({
              raw_content: sanitizedText,
              extraction_status: 'ok',
              extracted_at: new Date().toISOString(),
              metadata: {
                ...response.metadata,
                text_length: sanitizedText.length,
                page_count: extractionResult.metadata?.pageCount,
                byte_size: extractionResult.metadata?.byteSize,
                extraction_completed_at: new Date().toISOString()
              }
            })
            .eq('id', response.id);

          if (updateError) {
            console.error(`[process-remissvar-pdf] Update error for ${response.id}:`, updateError);
            result.errors.push({
              response_id: response.id,
              error: `Database update failed: ${updateError.message}`
            });
            continue;
          }
        }

        result.processed++;
        result.extracted++;
        result.details.push({
          response_id: response.id,
          filename: response.filename,
          text_length: sanitizedText.length,
          page_count: extractionResult.metadata?.pageCount,
          extraction_status: 'ok'
        });

      } catch (err) {
        console.error(`[process-remissvar-pdf] Error processing ${response.id}:`, err);
        result.errors.push({
          response_id: response.id,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    }

    console.log(`[process-remissvar-pdf] Complete - processed: ${result.processed}, extracted: ${result.extracted}, skipped: ${result.skipped}, errors: ${result.errors.length}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[process-remissvar-pdf] Fatal error:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
