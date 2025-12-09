import { Document, Element } from 'https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts';

export interface PdfCandidate {
  url: string;
  score: number;
  signals: string[];
  penalties: string[];
  linkText: string;
  filename: string;
  location: string;
}

export interface PdfExtractionResult {
  bestPdf: string | null;
  confidence: number;
  reasoning: string[];
  allCandidates: PdfCandidate[];
  extractionLog: string[];
  htmlSnapshot: string | null;
}

// ============================================
// Attachment Classification (v5.2.5)
// ============================================

export type FileType = 'pdf' | 'excel' | 'word' | 'other';

export interface AttachmentCandidate {
  url: string;
  fileType: FileType;
  label: string;
  source: 'ladda_ner_section' | 'download_section' | 'body';
}

export interface AttachmentExtractionResult {
  primaryFileType: FileType | null;
  attachments: AttachmentCandidate[];
  extractionLog: string[];
}

/**
 * Classify file type based on URL extension and link text
 */
export function classifyFileType(href: string, linkText: string | null): FileType {
  const lowerHref = href.toLowerCase();
  const lowerText = (linkText || '').toLowerCase();

  // Check URL extension first (most reliable)
  if (lowerHref.endsWith('.pdf')) {
    return 'pdf';
  }
  if (lowerHref.endsWith('.xlsx') || lowerHref.endsWith('.xls')) {
    return 'excel';
  }
  if (lowerHref.endsWith('.docx') || lowerHref.endsWith('.doc')) {
    return 'word';
  }

  // Check link text indicators
  if (lowerText.includes('(pdf)') || lowerText.includes('pdf,')) {
    return 'pdf';
  }
  if (lowerText.includes('(xlsx)') || lowerText.includes('(xls)') || lowerText.includes('excel')) {
    return 'excel';
  }
  if (lowerText.includes('(docx)') || lowerText.includes('(doc)') || lowerText.includes('word')) {
    return 'word';
  }

  // For contentassets/globalassets URLs without extension, assume PDF unless indicated otherwise
  if (lowerHref.includes('contentassets') || lowerHref.includes('globalassets')) {
    // But if the link text strongly suggests Excel, classify as such
    if (lowerText.includes('specifikation') && lowerText.includes('utgifter')) {
      return 'excel'; // Budget specification files are typically Excel
    }
    // Default to PDF for regeringen.se CDN links without clear extension
    return 'pdf';
  }

  return 'other';
}

/**
 * Check if a URL has a non-PDF file extension
 * Used as early filter to avoid scoring non-PDF files as PDF candidates
 */
export function hasNonPdfExtension(href: string): boolean {
  const lowerHref = href.toLowerCase();
  const nonPdfExtensions = ['.xlsx', '.xls', '.docx', '.doc', '.pptx', '.ppt', '.zip', '.rar'];
  return nonPdfExtensions.some(ext => lowerHref.endsWith(ext));
}

/**
 * Determine the location of a link within the page structure
 */
export function determineLocation(link: Element, doc: Document): string {
  // === PRIORITY 1: Check for structured download sections ===
  if (link.closest('.list--icons, .download, .file-list')) {
    return 'download_section';
  }
  
  let current = link.parentElement;
  let depth = 0;
  
  while (current && depth < 10) {
    const heading = current.querySelector('h2, h3, h4');
    if (heading?.textContent?.toLowerCase().includes('ladda ner')) {
      return 'download_section';
    }
    
    if (current.classList?.contains('main-content') || 
        current.classList?.contains('article-content')) {
      return 'main_content';
    }
    
    current = current.parentElement;
    depth++;
  }
  
  if (link.closest('aside, footer, .sidebar')) {
    return 'sidebar';
  }
  
  return 'body_text';
}

/**
 * Check if a link is within a download section
 */
export function isInDownloadSection(link: Element, doc: Document): boolean {
  let current = link.parentElement;
  let depth = 0;
  
  while (current && depth < 8) {
    const headings = current.querySelectorAll('h2, h3, h4');
    for (const heading of headings) {
      const text = heading.textContent?.toLowerCase() || '';
      if (text.includes('ladda ner') || 
          text.includes('dokument') || 
          text.includes('publicering')) {
        return true;
      }
    }
    current = current.parentElement;
    depth++;
  }
  
  return false;
}

/**
 * Extract all downloadable attachments from the page with file type classification
 * Only extracts from actual "Ladda ner" sections, not footer/navigation
 */
export function extractAttachments(doc: Document): AttachmentExtractionResult {
  const attachments: AttachmentCandidate[] = [];
  const extractionLog: string[] = [];
  const seenUrls = new Set<string>();

  extractionLog.push('[Attachment Extractor] Starting attachment extraction');

  // Find "Ladda ner" sections specifically (not footer links)
  const allHeadings = doc.querySelectorAll('h2, h3, h4');
  for (const heading of allHeadings) {
    const text = heading.textContent?.toLowerCase() || '';
    if (text.includes('ladda ner') || text.includes('download')) {
      // Get the parent section but not the whole page
      let section = heading.parentElement;
      
      // Walk up max 2 levels to find the containing section
      let depth = 0;
      while (section && depth < 2) {
        // Stop if we hit the main content wrapper
        if (section.classList?.contains('main-content') || 
            section.classList?.contains('article-content') ||
            section.tagName?.toLowerCase() === 'main' ||
            section.tagName?.toLowerCase() === 'article') {
          break;
        }
        section = section.parentElement;
        depth++;
      }
      
      if (section) {
        const linksInSection = section.querySelectorAll('a[href]');
        for (const link of linksInSection) {
          const href = (link as Element).getAttribute('href') || '';
          const linkText = link.textContent?.trim() || '';
          
          if (!href || href === '#' || seenUrls.has(href)) continue;
          
          // Skip social sharing, navigation, and footer links
          if (href.includes('facebook.com') || 
              href.includes('twitter.com') || 
              href.includes('linkedin.com') ||
              href.includes('email-protection') ||
              href.includes('/sveriges-regering/') ||
              href.includes('/regeringens-politik/') ||
              href.includes('/sverige-i-eu/') ||
              href.includes('/sa-styrs-sverige/') ||
              href.includes('/press/') ||
              href.includes('/kontakt/') ||
              href.includes('/jobba-hos-oss/') ||
              href.includes('/kalendarium/')) {
            continue;
          }
          
          // Only include links that look like actual document downloads
          const isDownloadLink = 
            href.endsWith('.pdf') ||
            href.endsWith('.xlsx') || href.endsWith('.xls') ||
            href.endsWith('.docx') || href.endsWith('.doc') ||
            href.includes('contentassets') ||
            href.includes('globalassets') ||
            linkText.toLowerCase().includes('(pdf') ||
            linkText.toLowerCase().includes('(xlsx') ||
            linkText.match(/\([\d,.]+ ?[kmg]b\)/i); // Has file size indicator
          
          if (!isDownloadLink) continue;
          
          // Normalize URL
          let fullUrl = href;
          if (href.startsWith('/')) {
            fullUrl = `https://www.regeringen.se${href}`;
          }
          
          const fileType = classifyFileType(fullUrl, linkText);
          seenUrls.add(href);
          
          attachments.push({
            url: fullUrl,
            fileType,
            label: linkText.substring(0, 200),
            source: 'ladda_ner_section'
          });
          
          extractionLog.push(`[Attachment Extractor] Found ${fileType}: ${linkText.substring(0, 50)}`);
        }
      }
    }
  }

  // Find structured download sections (.list--icons typically contains actual downloads)
  const structuredSections = doc.querySelectorAll('.list--icons');
  for (const section of structuredSections) {
    const links = (section as Element).querySelectorAll('a[href]');
    for (const link of links) {
      const href = (link as Element).getAttribute('href') || '';
      const linkText = link.textContent?.trim() || '';
      
      if (!href || href === '#' || seenUrls.has(href)) continue;
      
      // Skip non-document links
      if (href.includes('facebook.com') || href.includes('twitter.com') || href.includes('linkedin.com')) {
        continue;
      }
      
      let fullUrl = href;
      if (href.startsWith('/')) {
        fullUrl = `https://www.regeringen.se${href}`;
      }
      
      const fileType = classifyFileType(fullUrl, linkText);
      seenUrls.add(href);
      
      attachments.push({
        url: fullUrl,
        fileType,
        label: linkText.substring(0, 200),
        source: 'download_section'
      });
    }
  }

  // Determine primary file type (first PDF if available, otherwise first attachment)
  let primaryFileType: FileType | null = null;
  const pdfAttachment = attachments.find(a => a.fileType === 'pdf');
  if (pdfAttachment) {
    primaryFileType = 'pdf';
  } else if (attachments.length > 0) {
    primaryFileType = attachments[0].fileType;
  }

  extractionLog.push(`[Attachment Extractor] Total: ${attachments.length} attachments, primary: ${primaryFileType}`);

  return {
    primaryFileType,
    attachments,
    extractionLog
  };
}

/**
 * Find all PDF candidates using multi-tier detection
 * Now filters out non-PDF extensions early
 */
export function findPdfCandidates(doc: Document): Element[] {
  const candidates = new Set<Element>();
  const allLinks = doc.querySelectorAll('a[href]');
  
  // Find "Ladda ner" sections
  const allHeadings = doc.querySelectorAll('h2, h3, h4');
  for (const heading of allHeadings) {
    const text = heading.textContent?.toLowerCase() || '';
    if (text.includes('ladda ner') || text.includes('download')) {
      let section = heading.parentElement;
      if (section) {
        const linksInSection = section.querySelectorAll('a[href*=".pdf"]');
        linksInSection.forEach(link => candidates.add(link as Element));
      }
    }
  }
  
  // Find structured download sections
  const structuredSections = doc.querySelectorAll('.list--icons, .download, .file-list');
  for (const section of structuredSections) {
    const links = (section as Element).querySelectorAll('a[href*=".pdf"]');
    for (const link of links) {
      candidates.add(link as Element);
    }
  }
  
  // Global fallback: all PDF links (with early non-PDF filtering)
  allLinks.forEach(link => {
    const href = (link as Element).getAttribute('href') || '';
    const hrefLower = href.toLowerCase();
    
    // ============================================
    // GUARD: Skip obvious non-PDF extensions early (v5.2.5)
    // ============================================
    if (hasNonPdfExtension(href)) {
      // Log for forensics but don't add to candidates
      console.log('[pdf-scorer] Skipping non-PDF file extension:', href.substring(0, 100));
      return; // continue to next link
    }
    
    // Only add if it looks like a PDF
    if (hrefLower.endsWith('.pdf') || 
        hrefLower.includes('contentassets') || 
        hrefLower.includes('globalassets')) {
      candidates.add(link as Element);
    }
  });
  
  return Array.from(candidates);
}

/**
 * Score a PDF candidate based on various signals
 */
export function scorePdfCandidate(
  link: Element, 
  doc: Document, 
  docType: string, 
  docNumber: string
): PdfCandidate {
  const href = link.getAttribute('href') || '';
  const linkText = link.textContent?.toLowerCase().trim() || '';
  
  // Normalize URL
  let fullUrl = href;
  if (href.startsWith('/')) {
    fullUrl = `https://www.regeringen.se${href}`;
  }
  
  const filename = fullUrl.split('/').pop() || '';
  const filenameClean = filename.toLowerCase().replace('.pdf', '');
  const location = determineLocation(link, doc);
  
  let score = 0;
  const signals: string[] = [];
  const penalties: string[] = [];
  
  // ============================================
  // GUARD: Disqualify non-PDF extensions (v5.2.5 belt-and-braces)
  // ============================================
  if (hasNonPdfExtension(fullUrl)) {
    return {
      url: fullUrl,
      score: -999,
      signals: [],
      penalties: ['DISQUALIFIED:non_pdf_extension'],
      linkText,
      filename,
      location
    };
  }
  
  // === CORE SIGNALS (+10-25 points) ===
  if (fullUrl.endsWith('.pdf')) {
    score += 10;
    signals.push('pdf_extension');
  }
  
  const docNumClean = docNumber.replace(/\s+/g, '').toLowerCase();
  if (filenameClean.includes(docNumClean) || linkText.includes(docNumClean)) {
    score += 25;
    signals.push('doc_number_match');
  }
  
  if (linkText.match(/\([\d,.]+ ?mb\)/i)) {
    score += 12;
    signals.push('file_size_indicator');
  }
  
  // Check for "Ladda ner" context
  let foundLaddaNer = false;
  let current = link.parentElement;
  let depth = 0;
  
  while (current && depth < 5) {
    const nearbyHeading = current.querySelector('h2, h3, h4');
    if (nearbyHeading?.textContent?.toLowerCase().includes('ladda ner')) {
      foundLaddaNer = true;
      break;
    }
    current = current.parentElement;
    depth++;
  }

  if (foundLaddaNer) {
    score += 15;
    signals.push('ladda_ner_context');
  }
  
  // === MODERATE SIGNALS (+5-8 points) ===
  if (link.closest('.list--icons, .download, .file-list')) {
    score += 8;
    signals.push('in_structured_section');
  }
  
  // Check if this is a global fallback candidate
  const isGlobalFallback = !foundLaddaNer && 
                           !link.closest('.list--icons, .download, .file-list') &&
                           location === 'body_text';

  if (fullUrl.includes('contentassets') || fullUrl.includes('globalassets')) {
    if (isGlobalFallback) {
      score += 2;
      signals.push('global_fallback_contentassets');
    } else {
      score += 5;
      signals.push('regeringen_cdn');
    }
  }
  
  if (linkText.includes('pdf') || link.querySelector('.icon-pdf, .fa-file-pdf')) {
    score += 3;
    signals.push('explicit_pdf_indicator');
  }
  
  // === SWEDISH FULL REPORT RULE (+8 points) ===
  const isFullReport = !filenameClean.includes('kortversion') &&
                       !filenameClean.includes('sammanfattning') &&
                       !filenameClean.includes('summary') &&
                       !filenameClean.includes('english') &&
                       !linkText.includes('kortversion') &&
                       !linkText.includes('sammanfattning') &&
                       !linkText.includes('summary');
  
  if (isFullReport) {
    score += 8;
    signals.push('swedish_full_report');
  }
  
  // === PENALTIES (-5 to -10 points) ===
  if (filenameClean.includes('kortversion') || linkText.includes('kortversion')) {
    score -= 5;
    penalties.push('kortversion');
  }
  
  if (filenameClean.includes('sammanfattning') || linkText.includes('sammanfattning')) {
    score -= 5;
    penalties.push('sammanfattning');
  }
  
  if (filenameClean.includes('english') || filenameClean.includes('summary') || 
      linkText.includes('english') || linkText.includes('in english')) {
    score -= 5;
    penalties.push('english_version');
  }
  
  if (filenameClean.includes('faktablad') || linkText.includes('faktablad') ||
      (filenameClean.includes('fact') && filenameClean.includes('sheet'))) {
    score -= 7;
    penalties.push('fact_sheet');
  }
  
  if (!docType.includes('bilaga') && 
      (filenameClean.includes('bilaga') || linkText.includes('bilaga'))) {
    score -= 3;
    penalties.push('appendix');
  }
  
  // === DISQUALIFIERS (score = -999) ===
  if (!fullUrl.includes('regeringen.se') && !fullUrl.includes('contentassets')) {
    score = -999;
    penalties.push('DISQUALIFIED:external_domain');
  }
  
  if (linkText.includes('omslag') || linkText.includes('cover')) {
    score = -999;
    penalties.push('DISQUALIFIED:cover_page_only');
  }
  
  const isInStructuredSection = !!link.closest('.list--icons, .download, .file-list');
  const hasStrongPdfSignals = 
    linkText.toLowerCase().includes('pdf') ||
    linkText.match(/\([\d,.]+ ?mb\)/i) ||
    href.includes('/contentassets/') ||
    href.includes('/globalassets/') ||
    href.includes('.pdf');
  
  // Disqualify doc number in wrong context
  if (location === 'body_text' && !isInStructuredSection && 
      !hasStrongPdfSignals && filenameClean.includes(docNumClean)) {
    score = -999;
    penalties.push('DISQUALIFIED:doc_number_in_body_text');
  }
  
  return {
    url: fullUrl,
    score,
    signals,
    penalties,
    linkText,
    filename,
    location,
  };
}

/**
 * Extract and score all PDF candidates
 */
export function extractAndScorePdfs(
  doc: Document,
  docType: string,
  docNumber: string
): PdfExtractionResult {
  const extractionLog: string[] = [];
  extractionLog.push(`Starting PDF extraction for ${docType} ${docNumber}`);
  
  const candidates = findPdfCandidates(doc);
  extractionLog.push(`Found ${candidates.length} PDF candidates`);
  
  const scoredCandidates = candidates
    .map(link => scorePdfCandidate(link, doc, docType, docNumber))
    .filter(candidate => candidate.score > -999)
    .sort((a, b) => b.score - a.score);
  
  extractionLog.push(`Filtered to ${scoredCandidates.length} valid candidates`);
  
  if (scoredCandidates.length === 0) {
    return {
      bestPdf: null,
      confidence: 0,
      reasoning: ['No valid PDF candidates found'],
      allCandidates: [],
      extractionLog,
      htmlSnapshot: null,
    };
  }
  
  const best = scoredCandidates[0];
  const confidence = Math.min(100, Math.max(0, best.score * 2));
  
  const reasoning: string[] = [];
  reasoning.push(`Selected: ${best.filename} (score: ${best.score})`);
  reasoning.push(`Location: ${best.location}`);
  reasoning.push(`Signals: ${best.signals.join(', ')}`);
  if (best.penalties.length > 0) {
    reasoning.push(`Penalties: ${best.penalties.join(', ')}`);
  }
  
  return {
    bestPdf: best.url,
    confidence,
    reasoning,
    allCandidates: scoredCandidates.slice(0, 5),
    extractionLog,
    htmlSnapshot: null,
  };
}

/**
 * Capture relevant HTML sections for debugging
 */
export function captureRelevantHtml(doc: Document): string {
  const sections: string[] = [];
  
  const downloadSection = doc.querySelector('.list--icons, .download');
  if (downloadSection) {
    sections.push(`<!-- Download Section -->\n${downloadSection.outerHTML}`);
  }
  
  const laddanerHeadings = doc.querySelectorAll('h2, h3, h4');
  for (const heading of laddanerHeadings) {
    if (heading.textContent?.toLowerCase().includes('ladda ner')) {
      sections.push(`<!-- Ladda ner Section -->\n${heading.parentElement?.outerHTML || ''}`);
    }
  }
  
  return sections.join('\n\n');
}