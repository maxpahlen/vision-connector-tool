import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// ============================================
// Constants and Types
// ============================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RequestSchema = z.object({
  documentId: z.string().uuid().optional(),
  pdfUrl: z.string().url().optional(),
}).refine(
  (data) => data.documentId || data.pdfUrl,
  { message: 'Either documentId or pdfUrl must be provided' }
);

// ============================================
// Utility Functions
// ============================================

function handleCorsPreflightRequest(): Response {
  return new Response(null, { headers: corsHeaders });
}

function createErrorResponse(error: string, message: string, status = 400): Response {
  return new Response(
    JSON.stringify({ success: false, error, message }),
    { 
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

function createSuccessResponse(data: any): Response {
  return new Response(
    JSON.stringify(data),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 
    }
  );
}

function sanitizeTextFinal(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  let cleaned = text.replace(/\u0000/g, '');
  cleaned = cleaned.replace(/\r\n/g, '\n');
  cleaned = cleaned.replace(/\r/g, '\n');
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
  cleaned = cleaned.normalize('NFC');
  cleaned = cleaned.trim();
  
  return cleaned;
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

    const { documentId, pdfUrl } = validationResult.data;

    if (!documentId && !pdfUrl) {
      throw new Error('Either documentId or pdfUrl must be provided');
    }

    console.log(`Processing PDF for document: ${documentId || pdfUrl}`);

    // Validate configuration
    const pdfExtractorUrl = Deno.env.get('PDF_EXTRACTOR_URL');
    const pdfExtractorApiKey = Deno.env.get('PDF_EXTRACTOR_API_KEY');

    if (!pdfExtractorUrl || !pdfExtractorApiKey) {
      throw new Error('PDF extraction service not configured. Missing PDF_EXTRACTOR_URL or PDF_EXTRACTOR_API_KEY');
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

    console.log(`Calling PDF extraction service for: ${targetPdfUrl}`);

    // Call external PDF extraction service (targetPdfUrl is guaranteed to be non-null here due to prior checks)
    const extractionResult = await extractTextFromPdfService(
      pdfExtractorUrl,
      pdfExtractorApiKey,
      targetPdfUrl!,
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

      return createErrorResponse(
        extractionResult.error || 'extraction_failed',
        extractionResult.message || 'PDF text extraction failed',
        400
      );
    }

    console.log('Applying final sanitization');
    const finalText = sanitizeTextFinal(extractionResult.text || '');

    console.log(`Successfully extracted ${finalText.length} characters from PDF`);

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

      console.log(`Successfully updated document ${documentId} with extracted text (${finalText.length} chars, ${extractionResult.metadata?.pageCount} pages)`);
    }

    return createSuccessResponse({
      success: true,
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse('processing_error', errorMessage, 500);
  }
});

/**
 * Calls the external Node.js PDF extraction service
 */
async function extractTextFromPdfService(
  serviceUrl: string,
  apiKey: string,
  pdfUrl: string,
  documentId?: string,
  docNumber?: string
): Promise<{
  success: boolean;
  text?: string;
  metadata?: { pageCount: number; byteSize: number };
  error?: string;
  message?: string;
}> {
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

    if (!response.ok) {
      // Service returned an error response
      console.error(`PDF service error (${response.status}):`, result);
      return {
        success: false,
        error: result.error || 'service_error',
        message: result.message || `Service returned status ${response.status}`,
      };
    }

    if (!result.success && !result.ok) {
      // Service processed but extraction failed
      console.error('PDF extraction failed:', result);
      return {
        success: false,
        error: result.error || 'extraction_failed',
        message: result.message || 'PDF extraction failed',
      };
    }

    // Success case
    return {
      success: true,
      text: result.text,
      metadata: result.metadata,
    };

  } catch (error) {
    console.error('Error calling PDF extraction service:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      error: 'service_unavailable',
      message: `Failed to connect to PDF extraction service: ${errorMessage}`,
    };
  }
}

