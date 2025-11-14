const fetch = require('node-fetch');
const pdfParse = require('pdf-parse');

/**
 * Downloads a PDF from a URL with size and timeout checks
 * @param {string} pdfUrl - URL of the PDF to download
 * @param {object} config - Configuration object with limits
 * @returns {Promise<{ ok: boolean, buffer?: Buffer, error?: string, message?: string }>}
 */
async function downloadPdf(pdfUrl, config) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.DOWNLOAD_TIMEOUT_MS);
  
  try {
    const response = await fetch(pdfUrl, {
      signal: controller.signal,
      headers: { 
        'User-Agent': 'SOU-Scraper-PDF-Extractor/1.0'
      }
    });
    
    if (!response.ok) {
      return {
        ok: false,
        error: 'download_failed',
        message: `HTTP ${response.status}: ${response.statusText}`
      };
    }
    
    // Check content length before downloading
    const contentLength = parseInt(response.headers.get('content-length') || '0');
    
    if (contentLength > config.MAX_PDF_SIZE_BYTES) {
      return {
        ok: false,
        error: 'too_large',
        message: `PDF size ${contentLength} bytes exceeds limit of ${config.MAX_PDF_SIZE_BYTES} bytes (${Math.round(config.MAX_PDF_SIZE_BYTES / 1024 / 1024)}MB)`
      };
    }
    
    // Download the PDF
    const buffer = await response.buffer();
    clearTimeout(timeout);
    
    // Double-check actual size
    if (buffer.length > config.MAX_PDF_SIZE_BYTES) {
      return {
        ok: false,
        error: 'too_large',
        message: `Downloaded PDF size ${buffer.length} bytes exceeds limit`
      };
    }
    
    return { ok: true, buffer };
    
  } catch (err) {
    clearTimeout(timeout);
    
    if (err.name === 'AbortError') {
      return {
        ok: false,
        error: 'timeout',
        message: `Download timeout exceeded (${config.DOWNLOAD_TIMEOUT_MS}ms)`
      };
    }
    
    return {
      ok: false,
      error: 'download_failed',
      message: `Download failed: ${err.message}`
    };
  }
}

/**
 * Extracts text from a PDF buffer using pdf-parse
 * @param {Buffer} buffer - PDF file buffer
 * @param {object} config - Configuration object with timeout
 * @returns {Promise<{ ok: boolean, text?: string, metadata?: object, error?: string, message?: string }>}
 */
async function extractText(buffer, config) {
  try {
    // Create parsing promise
    const parsePromise = pdfParse(buffer);
    
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(
        () => reject(new Error('Parse timeout')), 
        config.REQUEST_TIMEOUT_MS
      )
    );
    
    // Race between parsing and timeout
    const data = await Promise.race([parsePromise, timeoutPromise]);
    
    return {
      ok: true,
      text: data.text,
      metadata: {
        pageCount: data.numpages,
        byteLength: buffer.length,
        textLength: data.text.length,
        pdfInfo: data.info || {}
      }
    };
    
  } catch (err) {
    if (err.message === 'Parse timeout') {
      return {
        ok: false,
        error: 'timeout',
        message: `PDF parsing timeout exceeded (${config.REQUEST_TIMEOUT_MS}ms)`
      };
    }
    
    return {
      ok: false,
      error: 'parse_failed',
      message: `PDF parsing failed: ${err.message}`
    };
  }
}

module.exports = {
  downloadPdf,
  extractText
};
