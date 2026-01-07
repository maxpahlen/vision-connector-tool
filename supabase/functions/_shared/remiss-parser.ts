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
  const remissinstanserUrls = new Set<string>();

  // Extract title
  const h1 = doc.querySelector('h1');
  const remissTitle = h1?.textContent?.trim();
  log.push(`Remiss title: ${remissTitle || 'not found'}`);

  // Look for deadline with enhanced patterns
  let remissDeadline: string | undefined;
  const deadlinePatterns = [
    /sista\s+svarsdatum[:\s]+(\d{1,2}\s+\w+\s+\d{4})/i,
    /senast\s+(\d{1,2}\s+\w+\s+\d{4})/i,
    /sista\s+dag\s+att\s+svara[^0-9]*(\d{1,2}\s+\w+\s+\d{4})/i,
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

  // ============================================
  // SECTION-BASED REMISSINSTANSER DETECTION (PRIMARY)
  // Look for headers like "Remissinstanser:" and get the next PDF link
  // ============================================
  const sectionHeaders = doc.querySelectorAll('strong, b, h2, h3, h4');
  
  for (const header of sectionHeaders) {
    if (remissinstanser) break; // Already found
    
    const headerText = (header as Element).textContent?.toLowerCase().trim() || '';
    
    // Match "Remissinstanser:" or "Remissinstanser" but NOT "remissvar"
    if (headerText.includes('remissinstanser') && !headerText.includes('remissvar')) {
      log.push(`Found remissinstanser section header: "${headerText}"`);
      
      // Strategy 1: Check parent's next list for links (ul.link-list pattern)
      const parent = (header as Element).parentElement;
      if (parent) {
        const list = parent.querySelector('ul.link-list, ul, ol');
        if (list) {
          const firstLink = list.querySelector('a[href*=".pdf"], a[href*="/contentassets/"]');
          if (firstLink) {
            const href = (firstLink as Element).getAttribute('href');
            if (href) {
              const fullUrl = href.startsWith('http') ? href : `https://www.regeringen.se${href}`;
              const filename = fullUrl.split('/').pop()?.split('?')[0] || '';
              remissinstanser = { url: fullUrl, filename };
              remissinstanserUrls.add(fullUrl);
              log.push(`Found remissinstanser PDF (section-list): ${filename}`);
              break;
            }
          }
        }
      }
      
      // Strategy 2: Walk sibling elements to find the link
      if (!remissinstanser && parent) {
        let sibling = parent.nextElementSibling;
        let attempts = 0;
        while (sibling && !remissinstanser && attempts < 5) {
          const links = sibling.querySelectorAll?.('a[href*=".pdf"], a[href*="/contentassets/"]');
          if (links && links.length > 0) {
            const href = (links[0] as Element).getAttribute('href');
            if (href) {
              const fullUrl = href.startsWith('http') ? href : `https://www.regeringen.se${href}`;
              const filename = fullUrl.split('/').pop()?.split('?')[0] || '';
              remissinstanser = { url: fullUrl, filename };
              remissinstanserUrls.add(fullUrl);
              log.push(`Found remissinstanser PDF (sibling-walk): ${filename}`);
              break;
            }
          }
          sibling = sibling.nextElementSibling;
          attempts++;
        }
      }
    }
  }

  // Find all download links (expanded selector)
  const downloadSections = doc.querySelectorAll('.download-document, .document-list, [class*="download"], [class*="remissvar"]');
  log.push(`Found ${downloadSections.length} download sections`);

  const allLinks = doc.querySelectorAll(
    'a[href*=".pdf"], a[href*="contentdisposition=attachment"], a[href*="/download/"], a[href*="/contentassets/"]'
  );
  log.push(`Found ${allLinks.length} potential document links`);

  const seenUrls = new Set<string>();

  for (const link of allLinks) {
    const href = (link as Element).getAttribute('href');
    if (!href) continue;

    const fullUrl = href.startsWith('http') ? href : `https://www.regeringen.se${href}`;
    
    if (seenUrls.has(fullUrl)) continue;
    seenUrls.add(fullUrl);

    // Skip if already identified as remissinstanser
    if (remissinstanserUrls.has(fullUrl)) {
      log.push(`Skipping remissinstanser URL from remissvar list: ${fullUrl.split('/').pop()}`);
      continue;
    }

    const linkText = (link as Element).textContent?.trim() || '';
    const filename = fullUrl.split('/').pop()?.split('?')[0] || '';
    const fileType = classifyFileType(fullUrl, linkText);

    // FALLBACK: Check if this is the remissinstanser list (keyword-based)
    if (!remissinstanser && (
        linkText.toLowerCase().includes('remissinstans') || 
        filename.toLowerCase().includes('remissinstans') ||
        linkText.toLowerCase().includes('sändlista'))) {
      remissinstanser = { url: fullUrl, filename };
      remissinstanserUrls.add(fullUrl);
      log.push(`Found remissinstanser PDF (keyword fallback): ${filename}`);
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
