/**
 * Sanitizes extracted PDF text to ensure it's safe for PostgreSQL storage
 * - Removes null bytes (\u0000)
 * - Normalizes line breaks
 * - Ensures valid UTF-8
 * @param {string} text - Raw extracted text
 * @returns {string} - Sanitized text
 * @throws {Error} - If sanitization fails
 */
function sanitizeText(text) {
  console.log(`[PDF-DEBUG:SANITIZE_1] Starting sanitization`, {
    hasText: !!text,
    textType: typeof text,
    inputLength: text?.length || 0,
    timestamp: new Date().toISOString()
  });
  
  if (!text || typeof text !== 'string') {
    console.log(`[PDF-DEBUG:SANITIZE_1] ⚠️ ANOMALY: Invalid input`, {
      text: text,
      textType: typeof text
    });
    return '';
  }
  
  try {
    // Step 1: Remove null bytes (PostgreSQL cannot store these)
    console.log(`[PDF-DEBUG:SANITIZE_1] Step 1: Removing null bytes`);
    let cleaned = text.replace(/\u0000/g, '');
    console.log(`[PDF-DEBUG:SANITIZE_1] After null byte removal`, { length: cleaned.length });
    
    // Step 2: Normalize line breaks
    console.log(`[PDF-DEBUG:SANITIZE_1] Step 2: Normalizing line breaks`);
    cleaned = cleaned.replace(/\r\n/g, '\n');
    cleaned = cleaned.replace(/\r/g, '\n');
    console.log(`[PDF-DEBUG:SANITIZE_1] After line break normalization`, { length: cleaned.length });
    
    // Step 3: Remove excessive blank lines (keep max 3 consecutive)
    console.log(`[PDF-DEBUG:SANITIZE_1] Step 3: Removing excessive blank lines`);
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
    console.log(`[PDF-DEBUG:SANITIZE_1] After blank line removal`, { length: cleaned.length });
    
    // Step 4: Ensure valid UTF-8 normalization
    console.log(`[PDF-DEBUG:SANITIZE_1] Step 4: UTF-8 normalization`);
    cleaned = cleaned.normalize('NFC');
    console.log(`[PDF-DEBUG:SANITIZE_1] After UTF-8 normalization`, { length: cleaned.length });
    
    // Step 5: Trim whitespace
    console.log(`[PDF-DEBUG:SANITIZE_1] Step 5: Trimming whitespace`);
    cleaned = cleaned.trim();
    
    console.log(`[PDF-DEBUG:SANITIZE_1] Sanitization complete`, {
      inputLength: text.length,
      outputLength: cleaned.length,
      outputShort: cleaned.length < 10
    });
    
    // Log silent anomaly
    if (cleaned.length < 10) {
      console.log(`[PDF-DEBUG:SANITIZE_1] ⚠️ ANOMALY: Sanitized result is < 10 chars`, {
        outputLength: cleaned.length,
        output: cleaned
      });
    }
    
    return cleaned;
    
  } catch (err) {
    console.log(`[PDF-DEBUG:SANITIZE_1] Sanitization exception`, {
      errorMessage: err.message,
      errorStack: err.stack,
      timestamp: new Date().toISOString()
    });
    throw new Error(`Sanitization failed: ${err.message}`);
  }
}

/**
 * Validates that sanitization was successful
 * @param {string} text - Sanitized text to validate
 * @returns {{ valid: boolean, error?: string, message?: string }}
 */
function validateSanitization(text) {
  console.log(`[PDF-DEBUG:SANITIZE_2] Starting validation`, {
    hasText: !!text,
    textType: typeof text,
    textLength: text?.length || 0,
    timestamp: new Date().toISOString()
  });
  
  // Verify no null bytes remain
  if (text.includes('\u0000')) {
    console.log(`[PDF-DEBUG:SANITIZE_2] Validation failed: Null bytes present`);
    return {
      valid: false,
      error: 'sanitization_error',
      message: 'Null bytes still present after sanitization'
    };
  }
  
  // Verify it's a string
  if (typeof text !== 'string') {
    console.log(`[PDF-DEBUG:SANITIZE_2] Validation failed: Not a string`, { textType: typeof text });
    return {
      valid: false,
      error: 'sanitization_error',
      message: 'Sanitized output is not a string'
    };
  }
  
  // Verify minimum content (not just whitespace)
  if (text.length < 10) {
    console.log(`[PDF-DEBUG:SANITIZE_2] Validation failed: Text too short`, {
      textLength: text.length,
      text: text
    });
    return {
      valid: false,
      error: 'parse_failed',
      message: 'Extracted text too short (likely empty or corrupted PDF)'
    };
  }
  
  console.log(`[PDF-DEBUG:SANITIZE_2] Validation passed`, { textLength: text.length });
  return { valid: true };
}

module.exports = {
  sanitizeText,
  validateSanitization
};
