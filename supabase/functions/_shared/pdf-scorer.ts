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
 * Find all PDF candidates using multi-tier detection
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
  
  // Global fallback: all PDF links
  allLinks.forEach(link => {
    const href = (link as Element).getAttribute('href') || '';
    if (href.endsWith('.pdf') || 
        href.includes('contentassets') || 
        href.includes('globalassets')) {
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
