/**
 * Integration tests for PDF Extractor Service
 * 
 * These tests validate the actual API contract and response structure
 * to prevent regressions like the success/ok field mismatch.
 * 
 * Run with: node test-integration.js
 */

const config = require('./config');

// Test configuration
const TEST_PDF_URL = 'https://www.regeringen.se/contentassets/e2db5de28e8745618e1b48f19e97cfec/ett-andamalsenligt-regelverk-for-bakgrundskontroller-dir-202583.pdf';
const SERVICE_URL = process.env.PDF_EXTRACTOR_URL || 'http://localhost:3000';
const API_KEY = process.env.PDF_EXTRACTOR_API_KEY;

// ANSI color codes for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m'
};

function log(color, symbol, message) {
  console.log(`${color}${symbol}${colors.reset} ${message}`);
}

/**
 * Test 1: Health endpoint returns correct structure
 */
async function testHealthEndpoint() {
  try {
    const response = await fetch(`${SERVICE_URL}/health`);
    const data = await response.json();
    
    if (response.status !== 200) {
      throw new Error(`Expected 200, got ${response.status}`);
    }
    
    if (data.status !== 'ok') {
      throw new Error(`Expected status 'ok', got '${data.status}'`);
    }
    
    if (!data.service || !data.version) {
      throw new Error('Missing required fields: service, version');
    }
    
    log(colors.green, '✓', 'Health endpoint test passed');
    return true;
  } catch (error) {
    log(colors.red, '✗', `Health endpoint test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test 2: Extract endpoint returns correct response structure
 * THIS IS THE CRITICAL TEST that would have caught the regression
 */
async function testExtractResponseStructure() {
  if (!API_KEY) {
    log(colors.yellow, '⚠', 'Skipping extract test: PDF_EXTRACTOR_API_KEY not set');
    return true;
  }
  
  try {
    const response = await fetch(`${SERVICE_URL}/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify({
        pdfUrl: TEST_PDF_URL,
        documentId: 'test-doc-123',
        docNumber: 'Test-001'
      })
    });
    
    const data = await response.json();
    
    // Critical assertion: Response must have "ok" field
    if (typeof data.ok !== 'boolean') {
      throw new Error(`Response missing required "ok" field (boolean). Got: ${JSON.stringify(Object.keys(data))}`);
    }
    
    if (response.ok && data.ok) {
      // Success response validation
      if (!data.text || typeof data.text !== 'string') {
        throw new Error('Success response missing "text" field (string)');
      }
      
      if (!data.metadata || typeof data.metadata !== 'object') {
        throw new Error('Success response missing "metadata" field (object)');
      }
      
      if (typeof data.metadata.pageCount !== 'number') {
        throw new Error('Metadata missing "pageCount" field (number)');
      }
      
      if (typeof data.metadata.textLength !== 'number') {
        throw new Error('Metadata missing "textLength" field (number)');
      }
      
      log(colors.green, '✓', `Extract response structure test passed (${data.metadata.textLength} chars extracted)`);
    } else {
      // Error response validation
      if (!data.error || typeof data.error !== 'string') {
        throw new Error('Error response missing "error" field (string)');
      }
      
      if (!data.message || typeof data.message !== 'string') {
        throw new Error('Error response missing "message" field (string)');
      }
      
      log(colors.green, '✓', `Extract error response structure test passed (error: ${data.error})`);
    }
    
    return true;
  } catch (error) {
    log(colors.red, '✗', `Extract response structure test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test 3: Invalid API key returns 401
 */
async function testInvalidApiKey() {
  try {
    const response = await fetch(`${SERVICE_URL}/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': 'invalid-key-123'
      },
      body: JSON.stringify({
        pdfUrl: TEST_PDF_URL
      })
    });
    
    if (response.status !== 401) {
      throw new Error(`Expected 401 for invalid API key, got ${response.status}`);
    }
    
    const data = await response.json();
    if (data.ok !== false) {
      throw new Error('Expected ok: false for error response');
    }
    
    log(colors.green, '✓', 'Invalid API key test passed');
    return true;
  } catch (error) {
    log(colors.red, '✗', `Invalid API key test failed: ${error.message}`);
    return false;
  }
}

/**
 * Test 4: Missing pdfUrl returns 400
 */
async function testMissingPdfUrl() {
  if (!API_KEY) {
    log(colors.yellow, '⚠', 'Skipping missing pdfUrl test: PDF_EXTRACTOR_API_KEY not set');
    return true;
  }
  
  try {
    const response = await fetch(`${SERVICE_URL}/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      },
      body: JSON.stringify({})
    });
    
    if (response.status !== 400) {
      throw new Error(`Expected 400 for missing pdfUrl, got ${response.status}`);
    }
    
    const data = await response.json();
    if (data.ok !== false) {
      throw new Error('Expected ok: false for error response');
    }
    
    log(colors.green, '✓', 'Missing pdfUrl test passed');
    return true;
  } catch (error) {
    log(colors.red, '✗', `Missing pdfUrl test failed: ${error.message}`);
    return false;
  }
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('\n🧪 PDF Extractor Integration Tests\n');
  console.log(`Service URL: ${SERVICE_URL}`);
  console.log(`API Key: ${API_KEY ? '***' + API_KEY.slice(-4) : 'NOT SET'}\n`);
  
  const results = await Promise.all([
    testHealthEndpoint(),
    testExtractResponseStructure(),
    testInvalidApiKey(),
    testMissingPdfUrl()
  ]);
  
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  console.log(`\n${passed === total ? colors.green : colors.red}Results: ${passed}/${total} tests passed${colors.reset}\n`);
  
  process.exit(passed === total ? 0 : 1);
}

// Run tests if executed directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('Test suite error:', error);
    process.exit(1);
  });
}

module.exports = { runTests };
