/**
 * Page Estimation Utilities for SOU Documents
 * 
 * Philosophy: These are BEST-EFFORT heuristics for estimating page numbers
 * from character positions in extracted PDF text. They will improve over time
 * as we gather more evidence about Swedish SOU document formatting.
 * 
 * The goal is NOT perfect accuracy, but CONSISTENT and TRACEABLE estimates
 * that enable forensic verification of citations.
 */

/**
 * Average characters per page for Swedish SOU documents
 * Based on analysis of SOU 2025:32 and similar documents
 * 
 * Calculation basis:
 * - Standard A4 page with typical margins
 * - 11-12pt body text
 * - ~45-50 characters per line
 * - ~50-55 lines per page
 * 
 * This is a starting point and may be refined as we process more documents.
 */
export const CHARS_PER_PAGE = 2500;

/**
 * Estimate page number from character position in document text
 * 
 * @param charPosition - Zero-based character index in the document
 * @param options - Optional configuration
 * @returns Estimated page number (1-indexed)
 * 
 * @example
 * estimatePageFromCharPosition(0) // => 1 (first page)
 * estimatePageFromCharPosition(2500) // => 2 (second page)
 * estimatePageFromCharPosition(5000) // => 3 (third page)
 */
export function estimatePageFromCharPosition(
  charPosition: number,
  options?: {
    charsPerPage?: number;
  }
): number {
  const charsPerPage = options?.charsPerPage || CHARS_PER_PAGE;
  
  // Page numbers are 1-indexed
  const estimatedPage = Math.floor(charPosition / charsPerPage) + 1;
  
  // Ensure we never return page 0 or negative pages
  return Math.max(1, estimatedPage);
}

/**
 * Swedish month names mapping to ISO month numbers
 */
const SWEDISH_MONTHS: Record<string, string> = {
  'januari': '01',
  'februari': '02',
  'mars': '03',
  'april': '04',
  'maj': '05',
  'juni': '06',
  'juli': '07',
  'augusti': '08',
  'september': '09',
  'oktober': '10',
  'november': '11',
  'december': '12',
};

/**
 * Parse Swedish date formats commonly found in SOU documents
 * 
 * Supported formats:
 * - "Stockholm i april 2025" → "2025-04"
 * - "den 7 april 2025" → "2025-04-07"
 * - "7 april 2025" → "2025-04-07"
 * - "i april 2025" → "2025-04"
 * 
 * @param text - Text containing a Swedish date
 * @returns ISO date string (YYYY-MM or YYYY-MM-DD) or null if no valid date found
 * 
 * @example
 * parseSwedishDate("Stockholm i april 2025") // => "2025-04"
 * parseSwedishDate("den 7 april 2025") // => "2025-04-07"
 */
export function parseSwedishDate(text: string): string | null {
  if (!text) return null;
  
  const lowerText = text.toLowerCase();
  
  // Pattern 1: "i [month] [year]" or "den [day] [month] [year]"
  // Examples: "i april 2025", "den 7 april 2025"
  const monthYearPattern = /(?:i\s+|den\s+(\d{1,2})\s+)?([a-zåäö]+)\s+(\d{4})/i;
  const match = lowerText.match(monthYearPattern);
  
  if (match) {
    const day = match[1]; // May be undefined
    const monthName = match[2];
    const year = match[3];
    
    const monthNum = SWEDISH_MONTHS[monthName];
    
    if (monthNum) {
      if (day) {
        // Format: YYYY-MM-DD
        const paddedDay = day.padStart(2, '0');
        return `${year}-${monthNum}-${paddedDay}`;
      } else {
        // Format: YYYY-MM (month precision only)
        return `${year}-${monthNum}`;
      }
    }
  }
  
  // Pattern 2: "[day] [month] [year]" without "den"
  // Example: "7 april 2025"
  const dayMonthYearPattern = /(\d{1,2})\s+([a-zåäö]+)\s+(\d{4})/i;
  const match2 = lowerText.match(dayMonthYearPattern);
  
  if (match2) {
    const day = match2[1];
    const monthName = match2[2];
    const year = match2[3];
    
    const monthNum = SWEDISH_MONTHS[monthName];
    
    if (monthNum) {
      const paddedDay = day.padStart(2, '0');
      return `${year}-${monthNum}-${paddedDay}`;
    }
  }
  
  return null;
}
