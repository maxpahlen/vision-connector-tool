import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentId, pdfUrl } = await req.json();

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

    // Call external PDF extraction service
    const extractionResult = await extractTextFromPdfService(
      pdfExtractorUrl,
      pdfExtractorApiKey,
      targetPdfUrl,
      documentId,
      docNumber
    );

    // Handle extraction errors
    if (!extractionResult.success) {
      console.error(`PDF extraction failed: ${extractionResult.error}`, extractionResult.message);

      if (documentId) {
        // Store error metadata
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

      return new Response(
        JSON.stringify({
          success: false,
          error: extractionResult.error,
          message: extractionResult.message,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Apply second-layer sanitization (defense in depth)
    console.log('Applying final sanitization');
    const finalText = sanitizeTextFinal(extractionResult.text || '');

    console.log(`Successfully extracted ${finalText.length} characters from PDF`);

    // Update document with extracted text and rich metadata
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

    return new Response(
      JSON.stringify({
        success: true,
        documentId,
        textLength: finalText.length,
        pageCount: extractionResult.metadata?.pageCount,
        preview: finalText.substring(0, 200),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in process-sou-pdf:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        success: false,
        error: 'processing_error',
        message: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
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

/**
 * Second-layer sanitization (defense in depth)
 * Ensures text is safe for PostgreSQL storage
 */
function sanitizeTextFinal(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }

  try {
    // Remove null bytes (PostgreSQL cannot store these)
    let cleaned = text.replace(/\u0000/g, '');

    // Normalize line breaks
    cleaned = cleaned.replace(/\r\n/g, '\n');
    cleaned = cleaned.replace(/\r/g, '\n');

    // Remove excessive blank lines (keep max 3 consecutive)
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');

    // Trim whitespace
    cleaned = cleaned.trim();

    return cleaned;

  } catch (err) {
    console.error('Final sanitization failed:', err);
    return text; // Return original if sanitization fails
  }
}
