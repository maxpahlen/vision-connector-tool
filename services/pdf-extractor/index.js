const express = require('express');
const config = require('./config');
const validator = require('./validator');
const extractor = require('./extractor');
const sanitizer = require('./sanitizer');

const app = express();

// Middleware
app.use(express.json());

// API Key authentication middleware
function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== config.API_KEY) {
    console.log('Authentication failed: Invalid or missing API key');
    return res.status(401).json({
      ok: false,
      error: 'unauthorized',
      message: 'Invalid or missing API key'
    });
  }
  
  next();
}

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'pdf-extractor',
    version: '1.0.0',
    config: {
      maxPdfSizeMB: Math.round(config.MAX_PDF_SIZE_BYTES / 1024 / 1024),
      requestTimeoutSeconds: config.REQUEST_TIMEOUT_MS / 1000,
      downloadTimeoutSeconds: config.DOWNLOAD_TIMEOUT_MS / 1000,
      allowedDomains: config.ALLOWED_DOMAINS
    }
  });
});

// PDF extraction endpoint (requires auth)
app.post('/extract', authenticate, async (req, res) => {
  const startTime = Date.now();
  const { pdfUrl, documentId, docNumber } = req.body;
  
  console.log(`[${new Date().toISOString()}] Extraction request: ${docNumber || documentId || 'unknown'}`);
  console.log(`  PDF URL: ${pdfUrl}`);
  
  // Validate input
  if (!pdfUrl) {
    return res.status(400).json({
      ok: false,
      error: 'unknown_error',
      message: 'Missing pdfUrl parameter'
    });
  }
  
  // Step 1: Validate domain
  console.log('  Step 1: Validating domain...');
  const domainCheck = validator.validatePdfUrl(pdfUrl);
  if (!domainCheck.valid) {
    console.log(`  ❌ Domain validation failed: ${domainCheck.error}`);
    return res.status(403).json({
      ok: false,
      error: domainCheck.error,
      message: domainCheck.message,
      pdfUrl
    });
  }
  console.log('  ✅ Domain validation passed');
  
  // Step 2: Download PDF with size/timeout checks
  console.log('  Step 2: Downloading PDF...');
  const downloadResult = await extractor.downloadPdf(pdfUrl, config);
  if (!downloadResult.ok) {
    console.log(`  ❌ Download failed: ${downloadResult.error}`);
    return res.status(400).json({
      ok: false,
      error: downloadResult.error,
      message: downloadResult.message,
      pdfUrl
    });
  }
  console.log(`  ✅ Downloaded ${downloadResult.buffer.length} bytes`);
  
  // Step 3: Extract text with timeout
  console.log('  Step 3: Extracting text...');
  const extractResult = await extractor.extractText(downloadResult.buffer, config);
  if (!extractResult.ok) {
    console.log(`  ❌ Extraction failed: ${extractResult.error}`);
    return res.status(400).json({
      ok: false,
      error: extractResult.error,
      message: extractResult.message,
      pdfUrl
    });
  }
  console.log(`  ✅ Extracted ${extractResult.text.length} characters from ${extractResult.metadata.pageCount} pages`);
  
  // Step 4: Sanitize text (first layer)
  console.log('  Step 4: Sanitizing text...');
  let sanitizedText;
  try {
    sanitizedText = sanitizer.sanitizeText(extractResult.text);
  } catch (err) {
    console.log(`  ❌ Sanitization failed: ${err.message}`);
    return res.status(500).json({
      ok: false,
      error: 'sanitization_error',
      message: err.message,
      pdfUrl
    });
  }
  
  // Step 5: Validate sanitization
  console.log('  Step 5: Validating sanitization...');
  const sanitizationCheck = sanitizer.validateSanitization(sanitizedText);
  if (!sanitizationCheck.valid) {
    console.log(`  ❌ Sanitization validation failed: ${sanitizationCheck.error}`);
    return res.status(400).json({
      ok: false,
      error: sanitizationCheck.error,
      message: sanitizationCheck.message,
      pdfUrl
    });
  }
  console.log(`  ✅ Sanitization validated, final length: ${sanitizedText.length} characters`);
  
  // Step 6: Return success with cleaned text
  const duration = Date.now() - startTime;
  console.log(`  ✅ Extraction complete in ${duration}ms`);
  
  return res.status(200).json({
    ok: true,
    text: sanitizedText,
    metadata: {
      ...extractResult.metadata,
      textLength: sanitizedText.length,
      documentId,
      docNumber,
      extractedAt: new Date().toISOString(),
      processingTimeMs: duration
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: 'not_found',
    message: 'Endpoint not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    ok: false,
    error: 'unknown_error',
    message: 'Internal server error'
  });
});

// Start server
const PORT = config.PORT;
app.listen(PORT, () => {
  console.log(`PDF Extractor Service running on port ${PORT}`);
  console.log(`Max PDF size: ${Math.round(config.MAX_PDF_SIZE_BYTES / 1024 / 1024)}MB`);
  console.log(`Request timeout: ${config.REQUEST_TIMEOUT_MS / 1000}s`);
  console.log(`Allowed domains: ${config.ALLOWED_DOMAINS.join(', ')}`);
  
  if (!config.API_KEY) {
    console.warn('⚠️  WARNING: PDF_EXTRACTOR_API_KEY not set! Service will reject all requests.');
  }
});
