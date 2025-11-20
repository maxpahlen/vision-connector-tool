/**
 * Text processing utilities for document content
 * Handles sanitization and normalization of extracted text
 */

/**
 * Sanitize and normalize text extracted from PDFs
 * Removes null bytes, normalizes line breaks, and limits consecutive newlines
 */
export function sanitizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  let cleaned = text.replace(/\u0000/g, ''); // Remove null bytes
  cleaned = cleaned.replace(/\r\n/g, '\n');  // Normalize Windows line endings
  cleaned = cleaned.replace(/\r/g, '\n');     // Normalize Mac line endings
  cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n'); // Limit consecutive newlines
  cleaned = cleaned.normalize('NFC');         // Unicode normalization
  cleaned = cleaned.trim();                   // Remove leading/trailing whitespace
  
  return cleaned;
}

/**
 * Calculate basic text statistics
 */
export function getTextStats(text: string): {
  characterCount: number;
  wordCount: number;
  lineCount: number;
  paragraphCount: number;
} {
  if (!text || typeof text !== 'string') {
    return {
      characterCount: 0,
      wordCount: 0,
      lineCount: 0,
      paragraphCount: 0,
    };
  }

  const lines = text.split('\n');
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);

  return {
    characterCount: text.length,
    wordCount: words.length,
    lineCount: lines.length,
    paragraphCount: paragraphs.length,
  };
}

/**
 * Truncate text to a maximum length, adding ellipsis if needed
 */
export function truncateText(text: string, maxLength: number): string {
  if (!text || text.length <= maxLength) {
    return text;
  }
  
  return text.slice(0, maxLength - 3) + '...';
}
