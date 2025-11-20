const fetch = require('node-fetch');
const pdfParse = require('pdf-parse');

/**
 * Downloads a PDF from a URL with size and timeout checks
 * @param {string} pdfUrl - URL of the PDF to download
 * @param {object} config - Configuration object with limits
 * @returns {Promise<{ ok: boolean, buffer?: Buffer, error?: string, message?: string }>}
 */
async function downloadPdf(pdfUrl, config) {
  console.log(`[PDF-DEBUG:DOWNLOAD] Starting download`, { 
    pdfUrl, 
    timestamp: new Date().toISOString(),
    timeout: config.DOWNLOAD_TIMEOUT_MS,
    maxSize: config.MAX_PDF_SIZE_BYTES
  });
  
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.DOWNLOAD_TIMEOUT_MS);
  
  try {
    console.log(`[PDF-DEBUG:DOWNLOAD] Initiating fetch request`);
    const response = await fetch(pdfUrl, {
      signal: controller.signal,
      headers: { 
        'User-Agent': 'SOU-Scraper-PDF-Extractor/1.0'
      }
    });
    
    console.log(`[PDF-DEBUG:DOWNLOAD] Fetch response received`, {
      status: response.status,
      statusText: response.statusText,
      contentType: response.headers.get('content-type'),
      contentLength: response.headers.get('content-length')
    });
    
    if (!response.ok) {
      console.log(`[PDF-DEBUG:DOWNLOAD] HTTP error response`, {
        status: response.status,
        statusText: response.statusText
      });
      return {
        ok: false,
        error: 'download_failed',
        message: `HTTP ${response.status}: ${response.statusText}`
      };
    }
    
    // Check content length before downloading
    const contentLength = parseInt(response.headers.get('content-length') || '0');
    console.log(`[PDF-DEBUG:DOWNLOAD] Content length check`, { contentLength, maxAllowed: config.MAX_PDF_SIZE_BYTES });
    
    if (contentLength > config.MAX_PDF_SIZE_BYTES) {
      console.log(`[PDF-DEBUG:DOWNLOAD] Content length exceeds limit`);
      return {
        ok: false,
        error: 'too_large',
        message: `PDF size ${contentLength} bytes exceeds limit of ${config.MAX_PDF_SIZE_BYTES} bytes (${Math.round(config.MAX_PDF_SIZE_BYTES / 1024 / 1024)}MB)`
      };
    }
    
    // Download the PDF
    console.log(`[PDF-DEBUG:DOWNLOAD] Reading response buffer`);
    const buffer = await response.buffer();
    clearTimeout(timeout);
    
    console.log(`[PDF-DEBUG:DOWNLOAD] Buffer received`, { 
      bufferLength: buffer.length,
      bufferType: typeof buffer,
      isBuffer: Buffer.isBuffer(buffer)
    });
    
    // Double-check actual size
    if (buffer.length > config.MAX_PDF_SIZE_BYTES) {
      console.log(`[PDF-DEBUG:DOWNLOAD] Buffer size exceeds limit`);
      return {
        ok: false,
        error: 'too_large',
        message: `Downloaded PDF size ${buffer.length} bytes exceeds limit`
      };
    }
    
    console.log(`[PDF-DEBUG:DOWNLOAD] Download successful`, { bufferLength: buffer.length });
    return { ok: true, buffer };
    
  } catch (err) {
    clearTimeout(timeout);
    
    console.log(`[PDF-DEBUG:DOWNLOAD] Download exception caught`, {
      errorName: err.name,
      errorMessage: err.message,
      errorStack: err.stack,
      timestamp: new Date().toISOString()
    });
    
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
  console.log(`[PDF-DEBUG:PARSE] Starting text extraction`, {
    bufferLength: buffer?.length,
    bufferType: typeof buffer,
    isBuffer: Buffer.isBuffer(buffer),
    timestamp: new Date().toISOString(),
    parseTimeout: config.REQUEST_TIMEOUT_MS
  });
  
  try {
    // Create parsing promise
    console.log(`[PDF-DEBUG:PARSE] Calling pdf-parse library`);
    const parsePromise = pdfParse(buffer);
    
    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(
        () => reject(new Error('Parse timeout')), 
        config.REQUEST_TIMEOUT_MS
      )
    );
    
    // Race between parsing and timeout
    console.log(`[PDF-DEBUG:PARSE] Waiting for parse or timeout`);
    const data = await Promise.race([parsePromise, timeoutPromise]);
    
    console.log(`[PDF-DEBUG:PARSE] Parse completed`, {
      hasData: !!data,
      hasText: !!data?.text,
      textLength: data?.text?.length || 0,
      textEmpty: !data?.text || data.text.length === 0,
      numpages: data?.numpages,
      numpagesMissing: !data?.numpages,
      hasInfo: !!data?.info
    });
    
    // Log silent anomalies
    if (!data?.text || data.text.length === 0) {
      console.log(`[PDF-DEBUG:PARSE] ⚠️ ANOMALY: text is empty or undefined`, {
        dataKeys: data ? Object.keys(data) : 'data is null/undefined',
        textValue: data?.text,
        textType: typeof data?.text
      });
    }
    
    if (!data?.numpages) {
      console.log(`[PDF-DEBUG:PARSE] ⚠️ ANOMALY: numpages is missing`, {
        dataKeys: data ? Object.keys(data) : 'data is null/undefined',
        numpages: data?.numpages
      });
    }
    
    console.log(`[PDF-DEBUG:PARSE] Extraction successful`, {
      textLength: data?.text?.length || 0,
      pageCount: data?.numpages
    });
    
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
    console.log(`[PDF-DEBUG:PARSE] Parse exception caught`, {
      errorName: err.name,
      errorMessage: err.message,
      errorStack: err.stack,
      timestamp: new Date().toISOString()
    });
    
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
