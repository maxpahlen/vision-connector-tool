/**
 * Shared Remiss Page Parser
 * 
 * Extracted from scrape-sou-remiss for reuse across:
 * - scrape-sou-remiss (original SOU-linked discovery)
 * - process-remiss-pages (new Phase 2.5 function)
 * 
 * VERIFICATION NOTE: This module preserves exact extraction_log format
 * from the original implementation. Any changes must be validated against
 * both consuming functions.
 */

import { DOMParser, Element } from 'https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts';

// ============================================
// Interfaces (exported for type safety)
// ============================================

export interface RemissvarDocument {
  url: string;
  filename: string;
  title?: string;
  responding_organization?: string;
  file_type: 'pdf' | 'word' | 'excel' | 'other';
}

export interface RemissPageResult {
  remiss_page_url: string;
  remiss_title?: string;
  remiss_deadline?: string;
  remissinstanser_pdf?: {
    url: string;
    filename: string;
  };
  remissvar_documents: RemissvarDocument[];
  extraction_log: string[];
}

// ============================================
// Helper Functions
// ============================================

/**
 * Classify file type from URL and link text
 */
export function classifyFileType(url: string, linkText: string): 'pdf' | 'word' | 'excel' | 'other' {
  const lowerUrl = url.toLowerCase();
  const lowerText = linkText.toLowerCase();
  
  if (lowerUrl.endsWith('.pdf') || lowerText.includes('pdf')) return 'pdf';
  if (lowerUrl.match(/\.(docx?|rtf)$/) || lowerText.includes('word')) return 'word';
  if (lowerUrl.match(/\.(xlsx?|csv)$/) || lowerText.includes('excel')) return 'excel';
  
  if (lowerUrl.includes('contentdisposition=attachment')) {
    if (lowerUrl.includes('.pdf')) return 'pdf';
    return 'pdf'; // Default for government downloads
  }
  
  return 'other';
}

/**
 * Extract organization name from filename or link text
 */
export function extractOrganization(filename: string, linkText: string): string | null {
  const text = linkText || filename;
  if (!text) return null;
  
  let org = text
    .replace(/^remissvar[-_\s]*/i, '')
    .replace(/\.pdf$/i, '')
    .replace(/\.docx?$/i, '')
    .replace(/[-_]/g, ' ')
    .trim();
  
  if (org.length < 3) return null;
  return org;
}

// ============================================
// Main Parser Function
// ============================================

/**
 * Parse a remiss page to extract remissvar documents
 * 
 * @param html - Raw HTML content of the remiss page
 * @param remissUrl - URL of the remiss page (for logging and result)
 * @returns RemissPageResult with extracted data and extraction_log
 * 
 * EXTRACTION LOG FORMAT (preserved from original):
 * - "Remiss title: {title}" or "Remiss title: not found"
 * - "Found deadline: {deadline}" (if found)
 * - "Found {n} download sections"
 * - "Found {n} potential document links"
 * - "Found remissinstanser PDF: {filename}" (if found)
 * - "Found remissvar: {filename} from {org}"
 * - "Total remissvar documents found: {count}"
 */
export function parseRemissPage(html: string, remissUrl: string): RemissPageResult {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (!doc) {
    return {
      remiss_page_url: remissUrl,
      remissvar_documents: [],
      extraction_log: ['Failed to parse HTML'],
    };
  }

  const log: string[] = [];
  const remissvarDocs: RemissvarDocument[] = [];
  let remissinstanser: { url: string; filename: string } | undefined;

  // Extract title
  const h1 = doc.querySelector('h1');
  const remissTitle = h1?.textContent?.trim();
  log.push(`Remiss title: ${remissTitle || 'not found'}`);

  // Look for deadline
  let remissDeadline: string | undefined;
  const deadlinePatterns = [
    /sista\s+svarsdatum[:\s]+(\d{1,2}\s+\w+\s+\d{4})/i,
    /senast\s+(\d{1,2}\s+\w+\s+\d{4})/i,
    /(\d{4}-\d{2}-\d{2})/,
  ];
  const pageText = doc.body?.textContent || '';
  for (const pattern of deadlinePatterns) {
    const match = pageText.match(pattern);
    if (match) {
      remissDeadline = match[1];
      log.push(`Found deadline: ${remissDeadline}`);
      break;
    }
  }

  // Find all download links
  const downloadSections = doc.querySelectorAll('.download-document, .document-list, [class*="download"], [class*="remissvar"]');
  log.push(`Found ${downloadSections.length} download sections`);

  const allLinks = doc.querySelectorAll('a[href*=".pdf"], a[href*="contentdisposition=attachment"], a[href*="/download/"]');
  log.push(`Found ${allLinks.length} potential document links`);

  const seenUrls = new Set<string>();

  for (const link of allLinks) {
    const href = (link as Element).getAttribute('href');
    if (!href) continue;

    const fullUrl = href.startsWith('http') ? href : `https://www.regeringen.se${href}`;
    
    if (seenUrls.has(fullUrl)) continue;
    seenUrls.add(fullUrl);

    const linkText = (link as Element).textContent?.trim() || '';
    const filename = fullUrl.split('/').pop()?.split('?')[0] || '';
    const fileType = classifyFileType(fullUrl, linkText);

    // Check if this is the remissinstanser list
    if (linkText.toLowerCase().includes('remissinstans') || 
        filename.toLowerCase().includes('remissinstans') ||
        linkText.toLowerCase().includes('sändlista')) {
      remissinstanser = { url: fullUrl, filename };
      log.push(`Found remissinstanser PDF: ${filename}`);
      continue;
    }

    // Check if this looks like a remissvar
    const isRemissvar = 
      linkText.toLowerCase().includes('remissvar') ||
      linkText.toLowerCase().includes('yttrande') ||
      filename.toLowerCase().includes('remissvar') ||
      (link as Element).closest('[class*="remissvar"]') !== null;

    if (isRemissvar || fileType === 'pdf') {
      const organization = extractOrganization(filename, linkText);
      
      remissvarDocs.push({
        url: fullUrl,
        filename,
        title: linkText || undefined,
        responding_organization: organization || undefined,
        file_type: fileType,
      });
      log.push(`Found remissvar: ${filename} from ${organization || 'unknown org'}`);
    }
  }

  log.push(`Total remissvar documents found: ${remissvarDocs.length}`);

  return {
    remiss_page_url: remissUrl,
    remiss_title: remissTitle,
    remiss_deadline: remissDeadline,
    remissinstanser_pdf: remissinstanser,
    remissvar_documents: remissvarDocs,
    extraction_log: log,
  };
}
