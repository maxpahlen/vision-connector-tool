/**
 * Organization name normalization and matching utilities
 * Phase 2.7: Remissinstanser & Remissvar Processing
 * 
 * Applies to both remiss_invitees and remiss_responses for consistent matching.
 * 
 * v2.7.9.3 - Fixed entity cache limit (5000 vs default 1000)
 */

/**
 * Patterns that indicate the string is a document title, not an organization name.
 * Used to reject invalid organization names.
 */
const DOCUMENT_TITLE_PATTERNS = [
  /^remiss\s+(av|om)/i,                    // "Remiss av betänkande..."
  /^betänkande/i,                          // "Betänkande SOU..."
  /^SOU\s+\d{4}/i,                         // "SOU 2025:103"
  /^Ds\s+\d{4}/i,                          // "Ds 2025:1"
  /^Prop\.\s*\d{4}/i,                      // "Prop. 2025/26:1"
  /^Dir\.\s*\d{4}/i,                       // "Dir. 2024:123"
  /\d{4}[\s:]\d+.*lag(en|stiftning)?/i,    // "2025:103 En ny produktansvarslag"
];

/**
 * File extension patterns to remove from organization names
 * Handles trailing whitespace and case variations
 */
const FILE_EXTENSION_PATTERN = /\.(pdf|docx?|xlsx?|pptx?|odt|rtf)\s*$/i;

/**
 * Module-level entity cache for performance (reset per function invocation)
 */
let cachedEntities: Array<{id: string; name: string}> | null = null;
let cacheEntityType: string | null = null;

/**
 * Clear entity cache - call at start of each function invocation
 */
export function clearEntityCache(): void {
  cachedEntities = null;
  cacheEntityType = null;
  console.log('[org-matcher] Entity cache cleared');
}

/**
 * Get current entity cache size (for diagnostics)
 */
export function getEntityCacheSize(): number {
  return cachedEntities?.length ?? 0;
}

/**
 * Known abbreviation aliases for common Swedish organizations
 * Maps abbreviation to canonical entity name pattern (for matching)
 */
const ABBREVIATION_ALIASES: Record<string, string> = {
  'SKR': 'Sveriges Kommuner och Regioner',
  'MSB': 'Myndigheten för samhällsskydd och beredskap',
  'FRA': 'Försvarets radioanstalt',
  'FOI': 'Totalförsvarets forskningsinstitut',
  'SCB': 'Statistiska centralbyrån',
  'FMV': 'Försvarets materielverk',
  'ISP': 'Inspektionen för strategiska produkter',
  'SBU': 'Statens beredning för medicinsk och social utvärdering',
  'IVO': 'Inspektionen för vård och omsorg',
  'TLV': 'Tandvårds- och läkemedelsförmånsverket',
  'ESV': 'Ekonomistyrningsverket',
  'ESF': 'Europeiska socialfonden',
  'HaV': 'Havs- och vattenmyndigheten',
  'SGU': 'Sveriges geologiska undersökning',
  'PRV': 'Patent- och registreringsverket',
  // Phase 2 additions
  'PTS': 'Post- och telestyrelsen',
  'KTH': 'Kungliga Tekniska högskolan',
  'IMY': 'Integritetsskyddsmyndigheten',
  'IVL': 'IVL Svenska Miljöinstitutet',
  'RFSL': 'Riksförbundet för homosexuellas, bisexuellas, transpersoners, queeras och intersexpersoners rättigheter',
  'SMHI': 'Sveriges meteorologiska och hydrologiska institut',
  'WWF': 'Världsnaturfonden',
  'SEKO': 'Service- och kommunikationsfacket',
  'SIS': 'Svenska institutet för standarder',
  'HSB': 'HSB Riksförbund',
  'LRF': 'Lantbrukarnas Riksförbund',
  'SPF': 'SPF Seniorerna',
  'PRO': 'Pensionärernas Riksorganisation',
  'TCO': 'Tjänstemännens Centralorganisation',
  'LO': 'Landsorganisationen i Sverige',
  'SACO': 'Sveriges akademikers centralorganisation',
  // Phase 2.1 additions from manual review
  'MPF': 'Myndigheten för psykologiskt försvar',
  'SIN': 'Säkerhets- och integritetsskyddsnämnden',
  'SVA': 'Statens veterinärmedicinska anstalt',
  'TMF': 'Trä- och Möbelföretagen',
};

/**
 * Checks if a string looks like a document title rather than an organization name
 */
export function isDocumentTitle(name: string): boolean {
  return DOCUMENT_TITLE_PATTERNS.some(pattern => pattern.test(name));
}

/**
 * Suffix patterns to strip from organization names
 * These are file/attachment suffixes that pollute the name
 */
const SUFFIX_STRIP_PATTERNS = [
  /\s*bilaga\s*(?:till\s+remissvar)?\s*$/i,  // "bilaga", "bilaga till remissvar"
  /\s*bilaga\s+\d+\s*$/i,                     // "bilaga 1", "bilaga 2"
  /\s*svar\s*$/i,                             // "svar" suffix
  /\s+AB$/i,                                  // "AB" company suffix
  /s$/,                                       // Possessive 's' (Vinnovas → Vinnova) - checked carefully below
];

/**
 * Prefix patterns to strip from organization names
 * These are attachment/classification prefixes
 */
const PREFIX_STRIP_PATTERNS = [
  /^bilaga\s+/i,                              // "Bilaga Östhammars kommun"
  /^övrigt\s+yttrande\s+/i,                   // "Övrigt yttrande Stiftelsen Activa"
  /^yttrande\s+från\s+/i,                     // "Yttrande från..."
];

/**
 * Hard rejection patterns - these are always invalid regardless of context
 * Contact info, URLs
 */
function hasContactInfo(text: string): boolean {
  const contactPatterns = [
    /@/,                                  // Email indicator
    /www\./i,                             // Website
    /https?:\/\//i,                       // Full URL
    /\.se\//,                             // Swedish domain path
    /\.gov\./,                            // Government domain
  ];
  return contactPatterns.some(pattern => pattern.test(text));
}

/**
 * Normalizes organization name by removing file extensions, file size suffixes, 
 * and extra whitespace. Returns empty string for invalid inputs (e.g., document titles).
 * 
 * Examples:
 * - "Riksdagens ombudsmän (JO) (pdf 140 kB)" → "Riksdagens ombudsmän (JO)"
 * - "Blekinge Tekniska Högskola.PDF" → "Blekinge Tekniska Högskola"
 * - "Remiss av betänkande SOU 2025:103" → "" (rejected as document title)
 * - "Vinnovas" → "Vinnova" (possessive stripped)
 * - "Teracom AB" → "Teracom" (company suffix stripped)
 * - "Bilaga Östhammars kommun" → "Östhammars kommun" (prefix stripped)
 */
export function normalizeOrganizationName(raw: string): string {
  if (!raw) return '';
  
  // Apply Unicode normalization to handle PDF quirks (composed vs decomposed chars)
  const normalizedRaw = raw.normalize('NFKC');
  
  // Hard rejection: contact info
  if (hasContactInfo(normalizedRaw)) {
    console.log(`[org-matcher] Rejected contact info: "${normalizedRaw.substring(0, 50)}..."`);
    return '';
  }
  
  // NOTE: Removed 120-char length rejection - legitimate org names can be long
  // e.g. "Riksförbundet för homosexuellas, bisexuellas, transpersoners, queeras och intersexpersoners rättigheter"
  
  let normalized = normalizedRaw
    // FIRST: Remove file size indicators like "(pdf 140 kB)" or "(word 2 MB)"
    // Must run before extension removal so ".PDF" ends up at string end
    .replace(/\s*\((pdf|word|doc|docx)\s+\d+(\.\d+)?\s*(kB|KB|MB|mb|b|B)\)\s*$/i, '')
    // SECOND: Remove standalone file size like "140 kB" at end
    .replace(/\s+\d+(\.\d+)?\s*(kB|KB|MB|mb|b|B)\s*$/i, '')
    // THIRD: Now remove file extensions like ".PDF", ".docx" (they're at end after size removal)
    .replace(FILE_EXTENSION_PATTERN, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

  // Apply prefix stripping (e.g., "Bilaga Östhammars kommun" → "Östhammars kommun")
  for (const pattern of PREFIX_STRIP_PATTERNS) {
    normalized = normalized.replace(pattern, '');
  }
  normalized = normalized.trim();
  
  // Apply suffix stripping EXCEPT possessive 's' (handle that specially)
  for (const pattern of SUFFIX_STRIP_PATTERNS) {
    // Skip the possessive 's' pattern here - handle it separately with more care
    if (pattern.source === 's$') continue;
    normalized = normalized.replace(pattern, '');
  }
  normalized = normalized.trim();
  
  // Strip trailing parenthetical abbreviations (2-6 uppercase chars)
  // e.g., "Riksförbundet... rättigheter (RFSL)" → "Riksförbundet... rättigheter"
  normalized = normalized.replace(/\s*\([A-ZÄÖÅ]{2,6}\)\s*$/, '');
  normalized = normalized.trim();

  // Handle possessive 's' suffix using exceptions list (safer than vowel heuristic)
  // KEEP_TRAILING_S: Names that legitimately end in 's' (not possessive)
  // Phase 2.7.9: Expanded list with Latin/proper names, require length > 6
  const KEEP_TRAILING_S = [
    'borås', 'vitrysslands', 'ledarnas', 'tidningarnas', 'ukrainas', 'försvarsmaktens',
    'nitus', 'corpus', 'campus', 'virus', 'status', 'fokus', 'plus',
    'mars', 'bonus', 'minus', 'versus', 'zeus', 'nexus'
  ];
  
  // Only strip 's' from names > 6 chars (short names like "Nitus" are likely proper names)
  if (normalized.endsWith('s') && normalized.length > 6) {
    const lowerNorm = normalized.toLowerCase();
    const isException = KEEP_TRAILING_S.some(exc => lowerNorm.endsWith(exc));
    
    if (!isException) {
      const withoutS = normalized.slice(0, -1);
      console.log(`[org-matcher] Stripped possessive 's': "${normalized}" → "${withoutS}"`);
      normalized = withoutS;
    }
  }

  // Canonicalize AP-fonden variants AFTER whitespace normalization
  // Handles "AP fonden", "AP  fonden", "AP–fonden" (en-dash) → "AP-fonden"
  normalized = normalized.replace(/\bAP[\s\u2013]+fonden\b/gi, 'AP-fonden');
  
  // Canonicalize hyphenation: "Patent och registreringsverket" → "Patent- och registreringsverket"
  // Common pattern: "X och Y" where X is a compound prefix should be "X- och Y"
  normalized = normalized.replace(/\b(Patent|Post|Havs|Tandvårds|Klimat|Arbets|Miljö)\s+och\s+/gi, '$1- och ');

  // Reject document titles
  if (isDocumentTitle(normalized)) {
    console.log(`[org-matcher] Rejected document title: "${normalized.substring(0, 50)}..."`);
    return '';
  }

  return normalized;
}

/**
 * Confidence levels for entity matching
 */
export type MatchConfidence = 'high' | 'medium' | 'low' | 'unmatched';

/**
 * Result of matching an organization name to an entity
 */
export interface MatchResult {
  entity_id: string | null;
  confidence: MatchConfidence;
  matched_name: string | null;
  similarity_score: number | null;
}

/**
 * Matches a normalized organization name against the entities table
 * Uses caching + trigram similarity for fuzzy matching
 * 
 * Thresholds:
 * - >= 0.9: high confidence (near exact match)
 * - >= 0.7: medium confidence (likely same org, minor variations)
 * - >= 0.5: low confidence (needs review)
 * - < 0.5: unmatched
 */
export async function matchOrganization(
  supabase: any,
  normalizedName: string,
  entityType: string = 'organization'
): Promise<MatchResult> {
  if (!normalizedName) {
    return { entity_id: null, confidence: 'unmatched', matched_name: null, similarity_score: null };
  }

  // First try exact match (case-insensitive)
  const { data: exactMatch } = await supabase
    .from('entities')
    .select('id, name')
    .ilike('name', normalizedName)
    .limit(1)
    .single();

  if (exactMatch) {
    return {
      entity_id: exactMatch.id,
      confidence: 'high',
      matched_name: exactMatch.name,
      similarity_score: 1.0
    };
  }

  // Second: Try hyphen/space-normalized exact match
  // "Dals Eds kommun" should match "Dals-Eds kommun" in DB
  // Create a pattern that treats spaces/hyphens as interchangeable
  const hyphenSpacePattern = normalizedName.replace(/[\s-]+/g, '%');
  
  const { data: hyphenMatch } = await supabase
    .from('entities')
    .select('id, name')
    .ilike('name', hyphenSpacePattern)
    .limit(1)
    .single();

  if (hyphenMatch) {
    // Verify it's actually a hyphen/space variation, not a different name entirely
    const inputNormalized = normalizedName.toLowerCase().replace(/[\s-]+/g, '');
    const matchNormalized = hyphenMatch.name.toLowerCase().replace(/[\s-]+/g, '');
    
    if (inputNormalized === matchNormalized) {
      console.log(`[org-matcher] Hyphen-normalized exact match: "${normalizedName}" -> "${hyphenMatch.name}"`);
      return {
        entity_id: hyphenMatch.id,
        confidence: 'high',
        matched_name: hyphenMatch.name,
        similarity_score: 1.0
      };
    }
  }

  // Use cached entities for fuzzy matching (cache once per run)
  // IMPORTANT: Supabase default limit is 1000, must specify higher for full entity list
  if (!cachedEntities || cacheEntityType !== entityType) {
    const { data: allOrgs } = await supabase
      .from('entities')
      .select('id, name')
      .eq('entity_type', entityType)
      .limit(5000);
    cachedEntities = allOrgs || [];
    cacheEntityType = entityType;
    console.log(`[org-matcher] Cached ${cachedEntities?.length ?? 0} entities for type '${entityType}'`);
  }

  if (!cachedEntities || cachedEntities.length === 0) {
    return { entity_id: null, confidence: 'unmatched', matched_name: null, similarity_score: null };
  }

  const normalizedUpper = normalizedName.toUpperCase();
  const normalizedLower = normalizedName.toLowerCase();

  // ABBREVIATION HANDLING: For short names (<=5 chars), use special matching
  if (normalizedName.length <= 5) {
    // Check if it's a known abbreviation alias
    if (ABBREVIATION_ALIASES[normalizedUpper]) {
      const aliasTarget = ABBREVIATION_ALIASES[normalizedUpper].toLowerCase();
      for (const org of cachedEntities) {
        if (org.name.toLowerCase().includes(aliasTarget) || aliasTarget.includes(org.name.toLowerCase())) {
          console.log(`[org-matcher] Abbreviation alias match: "${normalizedName}" -> "${org.name}"`);
          return {
            entity_id: org.id,
            confidence: 'high',
            matched_name: org.name,
            similarity_score: 1.0
          };
        }
      }
    }

    // Look for entity containing "(ABBREV)" pattern
    const abbrevPattern = `(${normalizedUpper})`;
    for (const org of cachedEntities) {
      if (org.name.toUpperCase().includes(abbrevPattern)) {
        console.log(`[org-matcher] Parenthetical abbreviation match: "${normalizedName}" -> "${org.name}"`);
        return {
          entity_id: org.id,
          confidence: 'high',
          matched_name: org.name,
          similarity_score: 1.0
        };
      }
    }

    // For short abbreviations with no match, route to review queue (low confidence)
    // This allows human review of abbreviations not in ABBREVIATION_ALIASES
    console.log(`[org-matcher] Unknown abbreviation: "${normalizedName}" - routing to review queue as low confidence`);
    return { entity_id: null, confidence: 'low', matched_name: null, similarity_score: 0.0 };
  }

  // Apply stad/kommun normalization for municipal matching
  const normalizedMunicipal = normalizeMunicipalName(normalizedLower);

  // Standard fuzzy matching for longer names
  let bestMatch: { id: string; name: string; score: number } | null = null;

  for (const org of cachedEntities) {
    const orgLower = org.name.toLowerCase();
    // Try both original and municipal-normalized versions
    const orgMunicipal = normalizeMunicipalName(orgLower);
    const score = Math.max(
      calculateSimilarity(normalizedLower, orgLower),
      calculateSimilarity(normalizedMunicipal, orgMunicipal)
    );
    
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { id: org.id, name: org.name, score };
    }
  }

  if (!bestMatch) {
    return { entity_id: null, confidence: 'unmatched', matched_name: null, similarity_score: null };
  }

  // Determine confidence based on score
  let confidence: MatchConfidence;
  if (bestMatch.score >= 0.9) {
    confidence = 'high';
  } else if (bestMatch.score >= 0.7) {
    confidence = 'medium';
  } else if (bestMatch.score >= 0.5) {
    confidence = 'low';
  } else {
    confidence = 'unmatched';
  }

  // Only return match if confidence is not unmatched
  if (confidence === 'unmatched') {
    return { entity_id: null, confidence: 'unmatched', matched_name: null, similarity_score: bestMatch.score };
  }

  return {
    entity_id: bestMatch.id,
    confidence,
    matched_name: bestMatch.name,
    similarity_score: bestMatch.score
  };
}

/**
 * Normalize municipal naming variants for matching
 * "Helsingborgs stad" should match "Helsingborgs kommun"
 */
function normalizeMunicipalName(name: string): string {
  return name
    .replace(/\bstad\b/gi, 'kommun')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Calculate similarity score between two strings (0-1)
 * Uses a combination of:
 * - Hyphen/space normalization (treats "X-Y" and "X Y" as equivalent)
 * - Guarded substring match bonus (length ratio >= 0.5 OR complete token match)
 * - Bigram overlap (Dice coefficient)
 * 
 * Phase 2.7.7 fixes:
 * - Prevents false positives like "kommunal" matching "nätverket för kommunala lärcentra"
 * - Allows valid matches like "Teracom" vs "Teracom AB"
 * 
 * Phase 2.7.9.1 fixes:
 * - Case-insensitive + hyphen normalization applied BEFORE all comparisons
 */
export function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a || !b) return 0.0;

  // Normalize FIRST: hyphen/space + lowercase before ANY comparison
  // "Dals-Eds kommun" and "Dals Eds kommun" should be equivalent
  const normalizeForComparison = (s: string) => 
    s.replace(/-/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  
  const aNorm = normalizeForComparison(a);
  const bNorm = normalizeForComparison(b);
  
  // Debug log for normalized comparison (temporary - remove after verification)
  console.log(`[org-matcher] calculateSimilarity: "${aNorm}" vs "${bNorm}"`);
  
  if (aNorm === bNorm) {
    console.log(`[org-matcher] Exact match after normalization: score=1.0`);
    return 1.0;
  }

  // Guarded substring match with length ratio + token boundary checks
  if (aNorm.includes(bNorm) || bNorm.includes(aNorm)) {
    const longer = aNorm.length > bNorm.length ? aNorm : bNorm;
    const shorter = aNorm.length > bNorm.length ? bNorm : aNorm;
    const ratio = shorter.length / longer.length;
    
    // Only apply substring bonus if:
    // 1. Shorter is >=50% of longer length (handles "Teracom" vs "Teracom AB")
    // 2. OR shorter appears as a complete token (word boundary)
    const isCompleteToken = new RegExp(`\\b${escapeRegex(shorter)}\\b`, 'i').test(longer);
    
    // Debug logging for substring matching (Phase 2.7.9)
    console.log(`[org-matcher] Substring check: "${shorter}" in "${longer}" - ratio: ${ratio.toFixed(2)}, isCompleteToken: ${isCompleteToken}`);
    
    if (ratio >= 0.5 || isCompleteToken) {
      const score = 0.8 + (0.2 * ratio);
      console.log(`[org-matcher] Substring match accepted: score=${score.toFixed(2)}`);
      return score;
    }
    console.log(`[org-matcher] Substring match rejected - falling through to bigram`);
    // Fall through to bigram matching for partial substring cases
    // e.g., "kommunal" inside "kommunala" is NOT a complete token match
  }

  // Use bigrams for similarity (Dice coefficient)
  const bigramsA = getBigrams(aNorm);
  const bigramsB = getBigrams(bNorm);
  
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0.0;

  let intersection = 0;
  for (const bigram of bigramsA) {
    if (bigramsB.has(bigram)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/**
 * Get bigrams (2-character sequences) from a string
 */
function getBigrams(str: string): Set<string> {
  const bigrams = new Set<string>();
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.add(str.substring(i, i + 2));
  }
  return bigrams;
}

/**
 * Blocked phrases that indicate boilerplate/non-organization text.
 * Logged when matched to allow monitoring for false positives.
 */
const BLOCKED_PHRASES = [
  // Document metadata - department headers (not invitees)
  /^regeringskansliet$/i,
  /^finansdepartementet$/i,
  /^justitiedepartementet$/i,
  /^socialdepartementet$/i,
  /^utbildningsdepartementet$/i,
  /^näringsdepartementet$/i,
  /^miljödepartementet$/i,
  /^klimat-?\s*och\s*näringslivsdepartementet$/i,
  /^utrikesdepartementet$/i,
  /^försvarsdepartementet$/i,
  /^kulturdepartementet$/i,
  /^arbetsmarknadsdepartementet$/i,
  /^landsbygds-?\s*och\s*infrastrukturdepartementet$/i,
  
  // Page numbers and formatting
  /^sida\s*\d+/i,
  /^sid\s*\d+/i,
  /^page\s*\d+/i,
  /^\d+\s*\(\s*\d+\s*\)$/,               // "1 (5)" format
  /^\d+$/,                                // Standalone numbers
  /^\d{2,4}[-\/]\d{2}$/,                  // Date fragments like "02-21", "2025-01"
  /^\d{2,4}[-\/]\d{2}[-\/]\d{2,4}$/,      // Full dates
  
  // Common PDF artifacts
  /^remissinstanser$/i,
  /^sändlista$/i,
  /^remisslista$/i,
  /^bilaga\s*\d*/i,
  /^dnr/i,
  /^datum/i,
  
  // Section headers
  /^sammanfattning/i,
  /^innehåll/i,
  /^inledning/i,
  /^bakgrund/i,
  
  // Document references
  /^remiss\s+av/i,
  /^betänkande/i,
  /^till\s+regeringen/i,
  /^se\s+bifogad/i,
  
  // Instruction/boilerplate text (commonly leaked from remiss PDFs)
  /myndigheter\s+under\s+regeringen/i,
  /remissvaren\s+ska\s+ha\s+kommit\s+in/i,
  /remissvaren\s+kommer\s+att\s+publiceras/i,
  /svaret\s+bör\s+lämnas/i,
  /svaren\s+bör\s+lämnas/i,
  /remissvaren\s+ska/i,
  /synpunkter\s+på\s+remissen/i,
  /i\s+ett\s+bearbetningsbart\s+format/i,
  /betankande@/i,
  /e-post(adress)?:\s*\S+@/i,
  /www\.regeringen\.se/i,
  /remissinstansens\s+namn/i,              // More general pattern
  /statsrådsberedningens\s+promemoria/i,
  /filnamnen\s+ska\s+motsvara/i,
  /ange\s+diarienummer/i,
  /^kopia\s+till$/i,
  /betänkandet\s+kan\s+laddas/i,
  /råd\s+om\s+hur\s+remissyttranden/i,
  /en\s+sammanfattning\s+av\s+remissvaren/i,
  /remissvar\s+lämnas\s+digitalt/i,
  /remissvar\s+ska\s+lämnas/i,
  /i\s+ämnesraden/i,                       // "i ämnesraden"
  /e-postmeddelandet/i,                    // Email instruction boilerplate
  /och\s+remissinstansens/i,               // "och remissinstansens"
  /instansens\s+synpunkter/i,
  /^och\s+i\s+mejlet/i,
  
  // Title patterns (single person names as headers)
  /^rättschef$/i,
  /^kansliråd$/i,
  /^departementsråd$/i,
  /^ämnesråd$/i,
  
  // Email format patterns
  /^\S+@\S+\.\S+$/,                       // Standalone email
];

/**
 * Checks if text matches any blocked phrase (boilerplate)
 * Logs matches for monitoring
 */
export function isBlockedPhrase(text: string): boolean {
  const normalizedText = text.trim();
  
  // Hard rejections: contact info
  if (hasContactInfo(normalizedText)) {
    console.log(`[org-matcher] Blocked contact info: "${normalizedText.substring(0, 40)}..."`);
    return true;
  }
  
  for (const pattern of BLOCKED_PHRASES) {
    if (pattern.test(normalizedText)) {
      console.log(`[org-matcher] Blocked boilerplate: "${normalizedText.substring(0, 40)}..."`);
      return true;
    }
  }
  return false;
}

/**
 * Parse status for diagnostic tracking
 */
export type ParseStatus = 'success' | 'no_numbered_entries' | 'extraction_failed';

/**
 * Parse result with diagnostics
 */
export interface ParseResult {
  organizations: string[];
  status: ParseStatus;
  reason: string;
  sample_lines: string[];
  total_lines: number;
  numbered_lines_found: number;
}

/**
 * Parse remissinstanser PDF text to extract organization list
 * 
 * WHITELIST APPROACH: Only extracts lines matching numbered pattern
 * This is the most reliable way to extract organizations since all legitimate invitees
 * in Swedish remissinstanser PDFs are prefixed with a number.
 * 
 * Pattern variants supported:
 *   "1. Almega" (dot)
 *   "1) Almega" (parenthesis)
 *   "1: Almega" (colon)
 *   "1- Almega" (hyphen)
 *   "1 – Almega" (en-dash)
 *   "1 - Almega" (spaced hyphen)
 *   
 * Also handles continuation lines when number and org are on separate lines.
 */
export function parseRemissinstanserText(text: string): string[] {
  const result = parseRemissinstanserTextWithDiagnostics(text);
  return result.organizations;
}

/**
 * Full diagnostic parse for debugging skipped PDFs
 */
export function parseRemissinstanserTextWithDiagnostics(text: string): ParseResult {
  if (!text) {
    return {
      organizations: [],
      status: 'extraction_failed',
      reason: 'No text provided',
      sample_lines: [],
      total_lines: 0,
      numbered_lines_found: 0
    };
  }

  const organizations: string[] = [];
  const lines = text.split('\n');
  const sampleLines: string[] = [];
  let numberedLinesFound = 0;
  
  // Collect first 30 lines for diagnostics
  for (let i = 0; i < Math.min(30, lines.length); i++) {
    const trimmed = lines[i].trim();
    if (trimmed) {
      sampleLines.push(trimmed.substring(0, 100));
    }
  }
  
  // EXPANDED WHITELIST: Multiple numbered entry patterns
  // Matches: "1." "1)" "1:" "1-" "1 –" "1 -"
  const numberedPattern = /^\s*(\d+)[\.\)\:\-–]\s*(.+)$/;
  const numberOnlyPattern = /^\s*(\d+)[\.\)\:\-–]?\s*$/;
  
  let pendingNumber: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    
    // Skip empty lines
    if (!trimmed) {
      pendingNumber = null; // Reset continuation tracking
      continue;
    }
    
    // Check for number-only line (continuation case)
    const numberOnlyMatch = trimmed.match(numberOnlyPattern);
    if (numberOnlyMatch) {
      pendingNumber = numberOnlyMatch[1];
      numberedLinesFound++;
      continue;
    }
    
    // Check if this is a continuation of a number-only line
    if (pendingNumber !== null) {
      // This line follows a number-only line - treat it as the org name
      const candidate = trimmed;
      pendingNumber = null;
      
      // Skip blocked phrases
      if (isBlockedPhrase(candidate)) continue;
      
      // Normalize
      const orgName = normalizeOrganizationName(candidate);
      if (orgName && orgName.length > 2) {
        organizations.push(orgName);
      }
      continue;
    }
    
    // Standard numbered entry on single line
    const match = trimmed.match(numberedPattern);
    if (match && match[2]) {
      numberedLinesFound++;
      const numPrefix = parseInt(match[1], 10);
      const candidate = match[2].trim();
      
      // VALIDATION: Reject suspiciously high number prefixes (likely page refs or dates)
      if (numPrefix > 300) {
        console.log(`[org-matcher] Rejected high prefix ${numPrefix}: "${candidate.substring(0, 40)}"`);
        continue;
      }
      
      // Skip blocked phrases (safety check)
      if (isBlockedPhrase(candidate)) continue;
      
      // Normalize the organization name
      const orgName = normalizeOrganizationName(candidate);
      
      // VALIDATION: Reject too short names (< 3 chars)
      if (!orgName || orgName.length < 3) {
        console.log(`[org-matcher] Rejected too short: "${orgName || candidate}"`);
        continue;
      }
      
      // VALIDATION: Reject purely numeric names
      if (/^\d+$/.test(orgName)) {
        console.log(`[org-matcher] Rejected purely numeric: "${orgName}"`);
        continue;
      }
      
      organizations.push(orgName);
    }
  }

  console.log(`[org-matcher] Parsed ${lines.length} lines, found ${numberedLinesFound} numbered entries, extracted ${organizations.length} orgs`);

  // Deduplicate
  const uniqueOrgs = [...new Set(organizations)];
  
  if (uniqueOrgs.length === 0) {
    if (numberedLinesFound === 0) {
      return {
        organizations: [],
        status: 'no_numbered_entries',
        reason: 'No numbered entries found in text - may be non-standard format',
        sample_lines: sampleLines,
        total_lines: lines.length,
        numbered_lines_found: 0
      };
    }
    return {
      organizations: [],
      status: 'extraction_failed',
      reason: `Found ${numberedLinesFound} numbered lines but all were filtered out`,
      sample_lines: sampleLines,
      total_lines: lines.length,
      numbered_lines_found: numberedLinesFound
    };
  }

  return {
    organizations: uniqueOrgs,
    status: 'success',
    reason: `Extracted ${uniqueOrgs.length} organizations from ${numberedLinesFound} numbered entries`,
    sample_lines: sampleLines,
    total_lines: lines.length,
    numbered_lines_found: numberedLinesFound
  };
}
