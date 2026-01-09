/**
 * Organization name normalization and matching utilities
 * Phase 2.7: Remissinstanser & Remissvar Processing
 * 
 * Applies to both remiss_invitees and remiss_responses for consistent matching.
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
 */
const FILE_EXTENSION_PATTERN = /\.(pdf|docx?|xlsx?|pptx?|odt|rtf)$/i;

/**
 * Checks if a string looks like a document title rather than an organization name
 */
export function isDocumentTitle(name: string): boolean {
  return DOCUMENT_TITLE_PATTERNS.some(pattern => pattern.test(name));
}

/**
 * Hard rejection patterns - these are always invalid regardless of context
 * Contact info, URLs, very long strings
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
 */
export function normalizeOrganizationName(raw: string): string {
  if (!raw) return '';
  
  // Hard rejection: contact info
  if (hasContactInfo(raw)) {
    console.log(`[org-matcher] Rejected contact info: "${raw.substring(0, 50)}..."`);
    return '';
  }
  
  // Hard rejection: very long strings (likely boilerplate paragraphs)
  if (raw.length > 120) {
    console.log(`[org-matcher] Rejected too long (${raw.length} chars): "${raw.substring(0, 50)}..."`);
    return '';
  }
  
  let normalized = raw
    // Remove file extensions like ".PDF", ".docx"
    .replace(FILE_EXTENSION_PATTERN, '')
    // Remove file size indicators like "(pdf 140 kB)" or "(word 2 MB)"
    .replace(/\s*\((pdf|word|doc|docx)\s+\d+(\.\d+)?\s*(kB|KB|MB|mb|b|B)\)\s*$/i, '')
    // Remove standalone file size like "140 kB" at end
    .replace(/\s+\d+(\.\d+)?\s*(kB|KB|MB|mb|b|B)\s*$/i, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();

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
 * Uses trigram similarity for fuzzy matching
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

  // Use trigram similarity for fuzzy matching
  // Note: This requires pg_trgm extension (already enabled in this project)
  const { data: similarMatches, error } = await supabase
    .rpc('similarity', { text1: normalizedName, text2: '' })  // This won't work directly
    
  // Fallback: fetch all organizations and compute similarity client-side
  // This is less efficient but works without custom RPC functions
  const { data: allOrgs } = await supabase
    .from('entities')
    .select('id, name')
    .eq('entity_type', entityType);

  if (!allOrgs || allOrgs.length === 0) {
    return { entity_id: null, confidence: 'unmatched', matched_name: null, similarity_score: null };
  }

  // Simple client-side similarity using Levenshtein-like approach
  let bestMatch: { id: string; name: string; score: number } | null = null;
  const normalizedLower = normalizedName.toLowerCase();

  for (const org of allOrgs) {
    const orgLower = org.name.toLowerCase();
    const score = calculateSimilarity(normalizedLower, orgLower);
    
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
 * Calculate similarity score between two strings (0-1)
 * Uses a combination of:
 * - Exact substring match bonus
 * - Bigram/trigram overlap (Dice coefficient)
 */
function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a || !b) return 0.0;

  // Exact substring match gets high score
  if (a.includes(b) || b.includes(a)) {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    return 0.8 + (0.2 * shorter.length / longer.length);
  }

  // Use bigrams for similarity (Dice coefficient)
  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);
  
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
  
  // Determine status
  let status: ParseStatus;
  let reason: string;
  
  if (uniqueOrgs.length > 0) {
    status = 'success';
    reason = `Extracted ${uniqueOrgs.length} organizations from ${numberedLinesFound} numbered entries`;
  } else if (numberedLinesFound > 0) {
    status = 'no_numbered_entries';
    reason = `Found ${numberedLinesFound} numbered lines but all were filtered (blocked/invalid)`;
  } else {
    status = 'no_numbered_entries';
    reason = 'No numbered entries found in PDF text';
  }

  return {
    organizations: uniqueOrgs,
    status,
    reason,
    sample_lines: sampleLines,
    total_lines: lines.length,
    numbered_lines_found: numberedLinesFound
  };
}
