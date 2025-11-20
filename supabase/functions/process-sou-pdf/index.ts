import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/http-utils.ts';
import { sanitizeText } from '../_shared/text-utils.ts';

// ============================================
// Request Validation
// ============================================

const RequestSchema = z.object({
  documentId: z.string().uuid().optional(),
  pdfUrl: z.string().url().optional(),
  task_id: z.string().uuid().optional(),
}).refine(
  (data) => data.documentId || data.pdfUrl,
  { message: 'Either documentId or pdfUrl must be provided' }
);

// ============================================
// PDF Extraction Service Interface
// ============================================

interface PdfExtractionResult {
  success: boolean;
  text?: string;
  metadata?: { 
    pageCount: number; 
    byteSize: number;
  };
  error?: string;
  message?: string;
}

async function extractTextFromPdfService(
  serviceUrl: string,
  apiKey: string,
  pdfUrl: string,
  documentId?: string,
  docNumber?: string
): Promise<PdfExtractionResult> {
  try {
    const response = await fetch(`${serviceUrl}/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        pdfUrl,
        documentId,
        docNumber,
      }),
    });

    const result = await response.json();

    // Check HTTP response status
    if (!response.ok) {
      console.error(`PDF service HTTP error (${response.status}):`, result.error, result.message);
      return {
        success: false,
        error: result.error || 'service_error',
        message: result.message || `PDF extraction service returned ${response.status}`,
      };
    }

    // Check service response structure (must have "ok" field)
    if (!result.ok) {
      console.error('PDF extraction failed:', result.error, result.message);
      return {
        success: false,
        error: result.error || 'extraction_failed',
        message: result.message || 'PDF text extraction failed',
      };
    }

    return {
      success: true,
      text: result.text,
      metadata: result.metadata,
    };

  } catch (error) {
    console.error('Error calling PDF extraction service:', error);
    return {
      success: false,
      error: 'service_unreachable',
      message: error instanceof Error ? error.message : 'Failed to reach PDF extraction service',
    };
  }
}

// ============================================
// Main Handler
// ============================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }

  try {
    const body = await req.json();
    const validationResult = RequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      return createErrorResponse(
        'Invalid request body',
        validationResult.error.issues.map(i => i.message).join(', '),
        400
      );
    }

    const { documentId, pdfUrl, task_id } = validationResult.data;

    console.log(`Processing PDF for document: ${documentId || pdfUrl}`);

    // Validate configuration
    const pdfExtractorUrl = Deno.env.get('PDF_EXTRACTOR_URL');
    const pdfExtractorApiKey = Deno.env.get('PDF_EXTRACTOR_API_KEY');

    if (!pdfExtractorUrl || !pdfExtractorApiKey) {
      throw new Error('PDF extraction service not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let document;
    let targetPdfUrl = pdfUrl;
    let docNumber = '';

    // If documentId provided, fetch the document to get PDF URL
    if (documentId) {
      console.log(`Fetching document ${documentId} from database`);
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (error || !data) {
        throw new Error(`Document not found: ${documentId}`);
      }

      document = data;
      targetPdfUrl = data.pdf_url;
      docNumber = data.doc_number || '';

      if (!targetPdfUrl) {
        throw new Error('Document has no PDF URL');
      }
    }

    if (!targetPdfUrl) {
      throw new Error('No PDF URL provided');
    }

    console.log(`Calling PDF extraction service for: ${targetPdfUrl}`);

    // Call external PDF extraction service
    const extractionResult = await extractTextFromPdfService(
      pdfExtractorUrl,
      pdfExtractorApiKey,
      targetPdfUrl,
      documentId,
      docNumber
    );

    if (!extractionResult.success) {
      console.error(`PDF extraction failed: ${extractionResult.error}`, extractionResult.message);

      if (documentId) {
        const errorMetadata = {
          ...document?.metadata,
          pdf_text_status: 'error',
          pdf_text_error: extractionResult.error,
          pdf_text_message: extractionResult.message,
          pdf_extraction_attempted_at: new Date().toISOString(),
        };

        await supabase
          .from('documents')
          .update({ metadata: errorMetadata })
          .eq('id', documentId);
      }

      // Mark task as failed if task_id provided
      if (task_id) {
        await supabase
          .from('agent_tasks')
          .update({
            status: 'failed',
            error_message: extractionResult.message || 'PDF extraction failed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', task_id);
      }

      return createErrorResponse(
        extractionResult.error || 'extraction_failed',
        extractionResult.message || 'PDF text extraction failed',
        400
      );
    }

    console.log('Sanitizing extracted text');
    const finalText = sanitizeText(extractionResult.text || '');

    console.log(`Successfully extracted ${finalText.length} characters from PDF`);

    // Update document in database if documentId provided
    if (documentId) {
      const successMetadata = {
        ...document?.metadata,
        pdf_text_status: 'ok',
        pdf_text_length: finalText.length,
        pdf_page_count: extractionResult.metadata?.pageCount,
        pdf_byte_size: extractionResult.metadata?.byteSize,
        pdf_extracted_at: new Date().toISOString(),
      };

      const { error: updateError } = await supabase
        .from('documents')
        .update({
          raw_content: finalText,
          processed_at: new Date().toISOString(),
          metadata: successMetadata,
        })
        .eq('id', documentId);

      if (updateError) {
        console.error('Error updating document:', updateError);
        throw updateError;
      }

      console.log(
        `Successfully updated document ${documentId} with extracted text ` +
        `(${finalText.length} chars, ${extractionResult.metadata?.pageCount} pages)`
      );
    }

    // Mark task as completed if task_id provided
    if (task_id) {
      await supabase
        .from('agent_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          output_data: {
            document_id: documentId,
            text_length: finalText.length,
            page_count: extractionResult.metadata?.pageCount,
          },
        })
        .eq('id', task_id);
    }

    return createSuccessResponse({
      text: finalText,
      metadata: {
        pageCount: extractionResult.metadata?.pageCount,
        textLength: finalText.length,
        byteSize: extractionResult.metadata?.byteSize,
      },
      documentId,
    });

  } catch (error) {
    console.error('Error in process-sou-pdf:', error);
    
    // Mark task as failed if task_id provided
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
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse('processing_error', errorMessage, 500);
  }
});
