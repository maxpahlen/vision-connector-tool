require('dotenv').config();

module.exports = {
  // Server configuration
  PORT: process.env.PORT || 3000,
  
  // Security
  API_KEY: process.env.PDF_EXTRACTOR_API_KEY,
  
  // Operational limits
  MAX_PDF_SIZE_BYTES: parseInt(process.env.MAX_PDF_SIZE_BYTES || '52428800'), // 50 MB default
  REQUEST_TIMEOUT_MS: parseInt(process.env.REQUEST_TIMEOUT_MS || '60000'),    // 60 seconds default
  DOWNLOAD_TIMEOUT_MS: parseInt(process.env.DOWNLOAD_TIMEOUT_MS || '30000'),  // 30 seconds default
  
  // Domain allow-list
  ALLOWED_DOMAINS: [
    'https://www.regeringen.se',
    'https://regeringen.se',
    'https://data.riksdagen.se'
  ]
};
