const config = require('./config');

/**
 * Validates that a PDF URL is from an allowed domain
 * @param {string} pdfUrl - The PDF URL to validate
 * @returns {{ valid: boolean, error?: string, message?: string }}
 */
function validatePdfUrl(pdfUrl) {
  try {
    const url = new URL(pdfUrl);
    const origin = `${url.protocol}//${url.hostname}`;
    
    const isAllowed = config.ALLOWED_DOMAINS.some(domain => {
      // Check exact match or if it starts with the domain
      return origin === domain || origin === new URL(domain).origin;
    });
    
    if (!isAllowed) {
      return {
        valid: false,
        error: 'domain_not_allowed',
        message: `Domain ${origin} is not in the allow-list. Allowed domains: ${config.ALLOWED_DOMAINS.join(', ')}`
      };
    }
    
    return { valid: true };
    
  } catch (err) {
    return {
      valid: false,
      error: 'download_failed',
      message: `Invalid PDF URL format: ${err.message}`
    };
  }
}

module.exports = {
  validatePdfUrl
};
