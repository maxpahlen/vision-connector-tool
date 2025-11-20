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
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  try {
    // Step 1: Remove null bytes (PostgreSQL cannot store these)
    let cleaned = text.replace(/\u0000/g, '');
    
    // Step 2: Normalize line breaks
    cleaned = cleaned.replace(/\r\n/g, '\n');
    cleaned = cleaned.replace(/\r/g, '\n');
    
    // Step 3: Remove excessive blank lines (keep max 3 consecutive)
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
    
    // Step 4: Ensure valid UTF-8 normalization
    cleaned = cleaned.normalize('NFC');
    
    // Step 5: Trim whitespace
    cleaned = cleaned.trim();
    
    return cleaned;
    
  } catch (err) {
    throw new Error(`Sanitization failed: ${err.message}`);
  }
}

/**
 * Validates that sanitization was successful
 * @param {string} text - Sanitized text to validate
 * @returns {{ valid: boolean, error?: string, message?: string }}
 */
function validateSanitization(text) {
  // Verify no null bytes remain
  if (text.includes('\u0000')) {
    return {
      valid: false,
      error: 'sanitization_error',
      message: 'Null bytes still present after sanitization'
    };
  }
  
  // Verify it's a string
  if (typeof text !== 'string') {
    return {
      valid: false,
      error: 'sanitization_error',
      message: 'Sanitized output is not a string'
    };
  }
  
  // Verify minimum content (not just whitespace)
  if (text.length < 10) {
    return {
      valid: false,
      error: 'parse_failed',
      message: 'Extracted text too short (likely empty or corrupted PDF)'
    };
  }
  
  return { valid: true };
}

module.exports = {
  sanitizeText,
  validateSanitization
};
