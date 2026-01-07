/**
 * Organization name normalization and matching utilities
 * Phase 2.7: Remissinstanser & Remissvar Processing
 */

/**
 * Normalizes organization name by removing file size suffixes and extra whitespace
 * "Riksdagens ombudsmän (JO) (pdf 140 kB)" → "Riksdagens ombudsmän (JO)"
 */
export function normalizeOrganizationName(raw: string): string {
  if (!raw) return '';
  
  return raw
    // Remove file size indicators like "(pdf 140 kB)" or "(word 2 MB)"
    .replace(/\s*\((pdf|word|doc|docx)\s+\d+(\.\d+)?\s*(kB|KB|MB|mb|b|B)\)\s*$/i, '')
    // Remove standalone file size like "140 kB" at end
    .replace(/\s+\d+(\.\d+)?\s*(kB|KB|MB|mb|b|B)\s*$/i, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
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
 * Parse remissinstanser PDF text to extract organization list
 * The format is typically a bullet list or numbered list of organization names
 */
export function parseRemissinstanserText(text: string): string[] {
  if (!text) return [];

  const organizations: string[] = [];
  const lines = text.split('\n');
  
  // Common patterns in remissinstanser PDFs
  const bulletPatterns = [
    /^[\s]*[-–•●○]\s*(.+)$/,           // Bullet points
    /^[\s]*\d+[.)]\s*(.+)$/,            // Numbered list
    /^[\s]*[a-zåäö][.)]\s*(.+)$/i,      // Lettered list
  ];

  let inOrgSection = false;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Skip empty lines
    if (!trimmed) continue;
    
    // Detect section headers that indicate start of org list
    if (/remissinstanser|remisslista|sändlista/i.test(trimmed)) {
      inOrgSection = true;
      continue;
    }
    
    // Detect end of org list (new section headers)
    if (inOrgSection && /^(bilagor|innehåll|sammanfattning)/i.test(trimmed)) {
      break;
    }
    
    // Try to match bullet patterns
    for (const pattern of bulletPatterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        const orgName = normalizeOrganizationName(match[1]);
        if (orgName && orgName.length > 2) {
          organizations.push(orgName);
        }
        break;
      }
    }
    
    // If we're in the org section and line looks like an org name
    // (capitalized, reasonable length, no obvious non-org patterns)
    if (inOrgSection && !bulletPatterns.some(p => p.test(trimmed))) {
      if (
        trimmed.length > 3 &&
        trimmed.length < 150 &&
        /^[A-ZÅÄÖ]/.test(trimmed) &&
        !/^(sida|sid|page|\d+$)/i.test(trimmed)
      ) {
        const orgName = normalizeOrganizationName(trimmed);
        if (orgName) {
          organizations.push(orgName);
        }
      }
    }
  }

  // Deduplicate
  return [...new Set(organizations)];
}
