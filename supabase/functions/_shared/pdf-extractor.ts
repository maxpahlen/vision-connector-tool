/**
 * Shared PDF Extraction Service Client
 * 
 * Provides consistent interface to external PDF extraction service.
 * Extracted from process-sou-pdf to prevent pattern drift.
 * 
 * Usage:
 *   import { getPdfExtractorConfig, extractTextFromPdf } from '../_shared/pdf-extractor.ts';
 *   const config = getPdfExtractorConfig();
 *   const result = await extractTextFromPdf(config, pdfUrl);
 */

// ============================================
// Types
// ============================================

export interface PdfExtractionResult {
  success: boolean;
  text?: string;
  metadata?: { 
    pageCount: number; 
    byteSize: number;
  };
  error?: string;
  message?: string;
}

export interface PdfExtractorConfig {
  serviceUrl: string;
  apiKey: string;
}

export interface ExtractOptions {
  documentId?: string;
  docNumber?: string;
}

// ============================================
// Configuration
// ============================================

/**
 * Get PDF extractor configuration from environment.
 * @throws Error if PDF_EXTRACTOR_URL or PDF_EXTRACTOR_API_KEY not configured
 */
export function getPdfExtractorConfig(): PdfExtractorConfig {
  const serviceUrl = Deno.env.get('PDF_EXTRACTOR_URL');
  const apiKey = Deno.env.get('PDF_EXTRACTOR_API_KEY');

  if (!serviceUrl || !apiKey) {
    throw new Error('PDF extraction service not configured: PDF_EXTRACTOR_URL or PDF_EXTRACTOR_API_KEY missing');
  }

  return { serviceUrl, apiKey };
}

// ============================================
// Core Extraction Function
// ============================================

/**
 * Extract text from a PDF URL using the external extraction service.
 * 
 * This function mirrors the exact behavior of the original process-sou-pdf
 * implementation, including error semantics and logging patterns.
 * 
 * @param config - Service configuration (URL and API key)
 * @param pdfUrl - URL of the PDF to extract
 * @param options - Optional metadata for logging (documentId, docNumber)
 * @returns Structured result with success/failure state
 */
export async function extractTextFromPdf(
  config: PdfExtractorConfig,
  pdfUrl: string,
  options?: ExtractOptions
): Promise<PdfExtractionResult> {
  try {
    console.log(`[pdf-extractor] Calling ${config.serviceUrl}/extract for: ${pdfUrl}`);
    
    const response = await fetch(`${config.serviceUrl}/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
      },
      body: JSON.stringify({
        pdfUrl,
        documentId: options?.documentId,
        docNumber: options?.docNumber,
      }),
    });

    const result = await response.json();

    // Check HTTP response status (preserved from process-sou-pdf)
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

    console.log(`[pdf-extractor] Success: ${result.text?.length || 0} chars, ${result.metadata?.pageCount || 0} pages`);

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
