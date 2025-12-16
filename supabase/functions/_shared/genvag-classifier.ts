/**
 * Genvägar Link Classifier
 * 
 * Classifies links from "Genvägar" sections on regeringen.se
 * into document-to-document reference types.
 */

export interface GenvagLink {
  url: string;
  anchorText: string;
  title?: string;
}

export interface ClassifiedReference {
  referenceType: 'cites' | 'amends' | 'responds_to' | 'based_on' | 'related';
  targetDocNumber: string | null;
  confidence: 'high' | 'medium' | 'low';
  isExternalUrl: boolean;
  externalUrlType?: 'press_release' | 'external' | 'document_bundle';
}

/**
 * URL patterns for document types on regeringen.se
 */
const DOC_URL_PATTERNS: Record<string, RegExp> = {
  sou: /\/statens-offentliga-utredningar\/\d{4}\/\d{2}\/(sou-\d{4}-?\d+)/i,
  directive: /\/kommittedirektiv\/\d{4}\/\d{2}\/(dir\.?-?\d{4}-?\d+)/i,
  proposition: /\/propositioner\/\d{4}\/\d{2}\/(prop\.?-?\d{4}\/?\d{2}:\d+)/i,
  remiss: /\/remisser\/\d{4}\/\d{2}\//i,
};

/**
 * Anchor text patterns that indicate reference type
 */
const ANCHOR_PATTERNS: Array<{ pattern: RegExp; type: ClassifiedReference['referenceType'] }> = [
  { pattern: /ändr(ing|ingar|as|at)/i, type: 'amends' },
  { pattern: /remissvar|svar på remiss/i, type: 'responds_to' },
  { pattern: /grundar sig|basera[ds]? på|utgår från/i, type: 'based_on' },
  { pattern: /direktiv|uppdrag/i, type: 'cites' },
  { pattern: /utredning(en)?|SOU/i, type: 'cites' },
  { pattern: /proposition(en)?/i, type: 'based_on' },
  { pattern: /relatera[dt]|se även|jämför/i, type: 'related' },
];

/**
 * Decode HTML entities commonly found in scraped text
 * Handles both numeric (&#xF6;) and named (&ouml;) entities
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  
  // Map of common HTML entities found in Swedish text
  const entities: Record<string, string> = {
    '&ouml;': 'ö', '&#xF6;': 'ö', '&#246;': 'ö',
    '&aring;': 'å', '&#xE5;': 'å', '&#229;': 'å',
    '&auml;': 'ä', '&#xE4;': 'ä', '&#228;': 'ä',
    '&Ouml;': 'Ö', '&#xD6;': 'Ö', '&#214;': 'Ö',
    '&Aring;': 'Å', '&#xC5;': 'Å', '&#197;': 'Å',
    '&Auml;': 'Ä', '&#xC4;': 'Ä', '&#196;': 'Ä',
    '&amp;': '&', '&#38;': '&',
    '&nbsp;': ' ', '&#160;': ' ',
    '&ndash;': '–', '&#x2013;': '–', '&#8211;': '–',
    '&mdash;': '—', '&#x2014;': '—', '&#8212;': '—',
  };
  
  let result = text;
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'gi'), char);
  }
  return result;
}

/**
 * Extract clean document number from URL or text
 * Returns ONLY the canonical number (e.g., "Dir. 2023:171"), NOT full titles
 * 
 * Supported formats:
 * - SOU YYYY:NN (Statens offentliga utredningar)
 * - Dir. YYYY:NN (Kommittédirektiv)
 * - Prop. YYYY/YY:NN (Propositioner)
 * - Ds YYYY:NN (Departementsserie)
 * - FPM YYYY/YY:NN (Faktapromemoria)
 * - XX20YY/NNNNN (Ministry dossier numbers, e.g., Ju2025/00680)
 */
export function extractDocNumber(urlOrText: string): string | null {
  // Decode HTML entities first
  const text = decodeHtmlEntities(urlOrText);
  
  // Try SOU pattern - STRICT: only capture "SOU YYYY:NN" format
  const souMatch = text.match(/\bSOU\s*(\d{4})\s*[:\-]\s*(\d+)/i);
  if (souMatch) {
    return `SOU ${souMatch[1]}:${souMatch[2]}`;
  }

  // Try Directive pattern - STRICT: only capture "Dir. YYYY:NN" format
  const dirMatch = text.match(/\bDir\.?\s*(\d{4})\s*[:\-]\s*(\d+)/i);
  if (dirMatch) {
    return `Dir. ${dirMatch[1]}:${dirMatch[2]}`;
  }

  // Try Proposition pattern - STRICT: only capture "Prop. YYYY/YY:NN" format
  const propMatch = text.match(/\bProp\.?\s*(\d{4})\s*[\/\-]\s*(\d{2})\s*[:\-]\s*(\d+)/i);
  if (propMatch) {
    return `Prop. ${propMatch[1]}/${propMatch[2]}:${propMatch[3]}`;
  }

  // Try Ds pattern (Departementsserie) - STRICT
  const dsMatch = text.match(/\bDs\s*(\d{4})\s*[:\-]\s*(\d+)/i);
  if (dsMatch) {
    return `Ds ${dsMatch[1]}:${dsMatch[2]}`;
  }

  // Try FPM pattern (Faktapromemoria) - common in EU-related docs
  const fpmMatch = text.match(/\b(\d{4}\/\d{2})\s*[:\-]?\s*FPM\s*(\d+)/i);
  if (fpmMatch) {
    return `${fpmMatch[1]}:FPM${fpmMatch[2]}`;
  }

  // Try Ministry dossier number pattern (e.g., Ju2025/00680, Fi2025/00974, U2025/02147)
  // Format: 1-3 letter ministry code + year + / + 4-5 digit number
  const dossierMatch = text.match(/\b([A-Za-z]{1,3})(\d{4})\/(\d{4,5})\b/);
  if (dossierMatch) {
    const ministryCode = dossierMatch[1].charAt(0).toUpperCase() + dossierMatch[1].slice(1).toLowerCase();
    return `${ministryCode}${dossierMatch[2]}/${dossierMatch[3]}`;
  }

  return null;
}

/**
 * Determine if URL is a press release or external resource
 */
function isExternalResource(url: string): { isExternal: boolean; type?: ClassifiedReference['externalUrlType'] } {
  const lowerUrl = url.toLowerCase();
  
  // Press releases
  if (lowerUrl.includes('/pressmeddelanden/') || lowerUrl.includes('/press/')) {
    return { isExternal: true, type: 'press_release' };
  }
  
  // Document bundles (ZIP, etc.)
  if (lowerUrl.match(/\.(zip|rar|tar\.gz)$/i)) {
    return { isExternal: true, type: 'document_bundle' };
  }
  
  // External domains
  if (!lowerUrl.includes('regeringen.se') && !lowerUrl.includes('riksdagen.se')) {
    return { isExternal: true, type: 'external' };
  }
  
  return { isExternal: false };
}

/**
 * Classify reference type from anchor text
 */
function classifyFromAnchorText(anchorText: string): ClassifiedReference['referenceType'] {
  const lowerText = anchorText.toLowerCase();
  
  for (const { pattern, type } of ANCHOR_PATTERNS) {
    if (pattern.test(lowerText)) {
      return type;
    }
  }
  
  return 'related'; // Default
}

/**
 * Classify reference type from URL path
 */
function classifyFromUrl(url: string): ClassifiedReference['referenceType'] {
  const lowerUrl = url.toLowerCase();
  
  // Propositions are typically "based_on" source (SOU)
  if (DOC_URL_PATTERNS.proposition.test(lowerUrl)) {
    return 'based_on';
  }
  
  // Directives are cited by SOUs
  if (DOC_URL_PATTERNS.directive.test(lowerUrl)) {
    return 'cites';
  }
  
  // SOUs cite other SOUs or directives
  if (DOC_URL_PATTERNS.sou.test(lowerUrl)) {
    return 'cites';
  }
  
  // Remiss pages
  if (DOC_URL_PATTERNS.remiss.test(lowerUrl)) {
    return 'related';
  }
  
  return 'related';
}

/**
 * Main classifier function
 */
export function classifyGenvagLink(link: GenvagLink): ClassifiedReference {
  const { url, anchorText } = link;
  
  // Check if external resource first
  const externalCheck = isExternalResource(url);
  if (externalCheck.isExternal) {
    return {
      referenceType: 'related',
      targetDocNumber: null,
      confidence: 'low',
      isExternalUrl: true,
      externalUrlType: externalCheck.type
    };
  }
  
  // Extract document number
  const targetDocNumber = extractDocNumber(url);
  
  // Classify reference type (anchor text takes priority)
  const anchorType = classifyFromAnchorText(anchorText);
  const urlType = classifyFromUrl(url);
  
  // Use anchor text classification if it's not 'related', otherwise use URL
  const referenceType = anchorType !== 'related' ? anchorType : urlType;
  
  // Determine confidence
  let confidence: ClassifiedReference['confidence'] = 'medium';
  
  // High confidence if we extracted a doc number AND have meaningful anchor text
  if (targetDocNumber && anchorType !== 'related') {
    confidence = 'high';
  }
  // Low confidence if no doc number and generic anchor text
  else if (!targetDocNumber && anchorType === 'related') {
    confidence = 'low';
  }
  
  return {
    referenceType,
    targetDocNumber,
    confidence,
    isExternalUrl: false
  };
}

/**
 * Batch classify multiple links
 */
export function classifyGenvagLinks(links: GenvagLink[]): Array<GenvagLink & ClassifiedReference> {
  return links.map(link => ({
    ...link,
    ...classifyGenvagLink(link)
  }));
}

/**
 * Parse Genvägar HTML section and extract links
 * 
 * Expected HTML structure:
 * <div class="genvägar">
 *   <h3>Genvägar</h3>
 *   <ul>
 *     <li><a href="...">Link text</a></li>
 *   </ul>
 * </div>
 */
export function parseGenvagSection(html: string): GenvagLink[] {
  const links: GenvagLink[] = [];
  
  // Find genvägar section (various possible class names and structures)
  const sectionPatterns = [
    /<div[^>]*class="[^"]*genv[äa]g[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /<section[^>]*class="[^"]*related[^"]*"[^>]*>([\s\S]*?)<\/section>/gi,
    /<aside[^>]*class="[^"]*shortcuts[^"]*"[^>]*>([\s\S]*?)<\/aside>/gi
  ];
  
  let sectionHtml = '';
  for (const pattern of sectionPatterns) {
    const match = html.match(pattern);
    if (match) {
      sectionHtml = match[0];
      break;
    }
  }
  
  if (!sectionHtml) {
    return links;
  }
  
  // Extract all anchor tags
  const linkPattern = /<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  
  while ((match = linkPattern.exec(sectionHtml)) !== null) {
    const url = match[1];
    const anchorText = match[2].trim();
    
    // Skip empty or anchor-only links
    if (!url || url === '#' || !anchorText) {
      continue;
    }
    
    // Normalize relative URLs
    const normalizedUrl = url.startsWith('http') 
      ? url 
      : `https://www.regeringen.se${url.startsWith('/') ? '' : '/'}${url}`;
    
    links.push({
      url: normalizedUrl,
      anchorText
    });
  }
  
  return links;
}
