/**
 * Phase 5.6.3: Keyword-Based Stance Detection
 * 
 * Swedish stance keyword patterns from SB PM 2021:1 guidance.
 * Implements negation handling and section-scoping for weighted matching.
 */

export interface StanceSignals {
  support_count: number;
  oppose_count: number;
  conditional_count: number;
  no_opinion_count: number;
  keywords_found: string[];
  section_context: 'summary' | 'stance' | 'body' | 'mixed';
  word_count: number;
}

export type StanceSummary = 'support' | 'oppose' | 'conditional' | 'neutral' | 'mixed';

interface KeywordPattern {
  pattern: RegExp;
  category: 'support' | 'oppose' | 'conditional' | 'no_opinion';
}

// =============================================================================
// NEGATION PATTERNS (checked first - override positive patterns)
// =============================================================================

const NEGATION_PATTERNS: KeywordPattern[] = [
  // "inte tillstyrker" / "inte instämmer" → opposition
  { pattern: /\binte\s+tillstyrker\b/gi, category: 'oppose' },
  { pattern: /\binte\s+instämmer\b/gi, category: 'oppose' },
  { pattern: /\binte\s+välkomnar\b/gi, category: 'oppose' },
  { pattern: /\binte\s+stödjer\b/gi, category: 'oppose' },
  // "kan inte stödja/tillstyrka" → opposition
  { pattern: /\bkan\s+inte\s+stödja\b/gi, category: 'oppose' },
  { pattern: /\bkan\s+inte\s+tillstyrka\b/gi, category: 'oppose' },
  { pattern: /\bkan\s+inte\s+ställa\s+sig\s+bakom\b/gi, category: 'oppose' },
  // "inte positiv" → opposition
  { pattern: /\binte\s+positiv/gi, category: 'oppose' },
  { pattern: /\binte\s+ställer\s+sig\s+positiv/gi, category: 'oppose' },
];

// =============================================================================
// POSITIVE STANCE PATTERNS
// =============================================================================

const SUPPORT_PATTERNS: KeywordPattern[] = [
  { pattern: /\b(vi\s+)?instämmer\b/gi, category: 'support' },
  { pattern: /\btillstyrker\b/gi, category: 'support' },
  { pattern: /\bvälkomnar\b/gi, category: 'support' },
  { pattern: /\bstödjer\s+(förslaget|utredningen|förslagen)\b/gi, category: 'support' },
  { pattern: /\bställer\s+sig\s+positiv/gi, category: 'support' },
  { pattern: /\bser\s+positivt\s+på\b/gi, category: 'support' },
  { pattern: /\bär\s+positiv\s+till\b/gi, category: 'support' },
  { pattern: /\btillstyrks\b/gi, category: 'support' },
  { pattern: /\bdelar\s+(utredningens\s+)?bedömning\b/gi, category: 'support' },
];

const OPPOSE_PATTERNS: KeywordPattern[] = [
  { pattern: /\b(vi\s+)?motsätter\s+(oss|sig)\b/gi, category: 'oppose' },
  { pattern: /\bavstyrker\b/gi, category: 'oppose' },
  { pattern: /\bavråder\b/gi, category: 'oppose' },
  { pattern: /\binvänder\s+mot\b/gi, category: 'oppose' },
  { pattern: /\bställer\s+sig\s+kritisk/gi, category: 'oppose' },
  { pattern: /\bär\s+kritisk\s+till\b/gi, category: 'oppose' },
  { pattern: /\bavstyrks\b/gi, category: 'oppose' },
  { pattern: /\bser\s+negativt\s+på\b/gi, category: 'oppose' },
  { pattern: /\bär\s+negativ\s+till\b/gi, category: 'oppose' },
  { pattern: /\binte\s+delar\s+(utredningens\s+)?bedömning\b/gi, category: 'oppose' },
];

const CONDITIONAL_PATTERNS: KeywordPattern[] = [
  { pattern: /\bmed\s+förbehåll\b/gi, category: 'conditional' },
  { pattern: /\bunder\s+förutsättning\b/gi, category: 'conditional' },
  { pattern: /\bi\s+huvudsak\s+(positiv|tillstyrker)\b/gi, category: 'conditional' },
  { pattern: /\bvillkorat\b/gi, category: 'conditional' },
  { pattern: /\bom\s+(nödvändiga\s+)?resurser\s+tillförs\b/gi, category: 'conditional' },
  { pattern: /\bi\s+stort\s+(sett\s+)?(positiv|tillstyrker)\b/gi, category: 'conditional' },
  { pattern: /\bmed\s+vissa\s+reservationer\b/gi, category: 'conditional' },
  { pattern: /\bgrundsätt?ligen\s+positiv\b/gi, category: 'conditional' },
];

const NO_OPINION_PATTERNS: KeywordPattern[] = [
  { pattern: /\b(vi\s+har\s+)?inga\s+synpunkter\b/gi, category: 'no_opinion' },
  { pattern: /\bavstår\s+från\s+(att\s+yttra|synpunkter)\b/gi, category: 'no_opinion' },
  { pattern: /\b(lämnar|har)\s+inget\s+att\s+erinra\b/gi, category: 'no_opinion' },
  { pattern: /\bingen\s+erinran\b/gi, category: 'no_opinion' },
  { pattern: /\blämnar\s+inga\s+synpunkter\b/gi, category: 'no_opinion' },
  { pattern: /\binte\s+berörs\b/gi, category: 'no_opinion' },
  { pattern: /\bfaller\s+utanför\b/gi, category: 'no_opinion' },
];

// =============================================================================
// SECTION DETECTION (for weighted scoring)
// =============================================================================

interface TextSection {
  type: 'summary' | 'stance' | 'body';
  content: string;
  weight: number;
}

/**
 * Extract sections from text for weighted analysis.
 * "Sammanfattning" and "Ställningstaganden" sections get 2x weight.
 */
function extractSections(text: string): TextSection[] {
  const sections: TextSection[] = [];
  const lines = text.split('\n');
  
  let currentSection: TextSection = { type: 'body', content: '', weight: 1.0 };
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase().trim();
    
    // Detect section headers
    if (lowerLine.includes('sammanfattning') && lowerLine.length < 50) {
      // Save previous section if it has content
      if (currentSection.content.trim()) {
        sections.push({ ...currentSection });
      }
      currentSection = { type: 'summary', content: line + '\n', weight: 2.0 };
    } else if (
      (lowerLine.includes('ställningstagande') || 
       lowerLine.includes('yttrande') ||
       lowerLine.includes('synpunkter')) && 
      lowerLine.length < 60
    ) {
      if (currentSection.content.trim()) {
        sections.push({ ...currentSection });
      }
      currentSection = { type: 'stance', content: line + '\n', weight: 2.0 };
    } else {
      currentSection.content += line + '\n';
    }
  }
  
  // Add final section
  if (currentSection.content.trim()) {
    sections.push(currentSection);
  }
  
  // If no special sections found, return all as body
  if (sections.length === 0) {
    sections.push({ type: 'body', content: text, weight: 1.0 });
  }
  
  return sections;
}

/**
 * Count keyword matches in text, applying pattern matching.
 * Returns array of matched keywords for transparency.
 */
function countMatches(text: string, patterns: KeywordPattern[]): Map<string, string[]> {
  const matches = new Map<string, string[]>();
  
  for (const { pattern, category } of patterns) {
    const found = text.match(pattern);
    if (found) {
      const existing = matches.get(category) || [];
      existing.push(...found.map(m => m.toLowerCase().trim()));
      matches.set(category, existing);
    }
  }
  
  return matches;
}

/**
 * Mask already-matched negation patterns to prevent double-counting.
 */
function maskNegationPatterns(text: string): string {
  let masked = text;
  for (const { pattern } of NEGATION_PATTERNS) {
    masked = masked.replace(pattern, '___MASKED___');
  }
  return masked;
}

// =============================================================================
// MAIN ANALYSIS FUNCTION
// =============================================================================

export interface AnalysisResult {
  summary: StanceSummary;
  signals: StanceSignals;
}

/**
 * Analyze text for stance using Swedish keyword patterns.
 * 
 * Features:
 * - Negation patterns checked first (e.g., "inte tillstyrker" → oppose)
 * - Section-scoping: "Sammanfattning" and "Ställningstaganden" get 2x weight
 * - Returns detailed signals for verification
 */
export function analyzeStance(text: string): AnalysisResult {
  // Handle empty/short text
  if (!text || text.length < 100) {
    return {
      summary: 'neutral',
      signals: {
        support_count: 0,
        oppose_count: 0,
        conditional_count: 0,
        no_opinion_count: 0,
        keywords_found: [],
        section_context: 'body',
        word_count: text ? text.split(/\s+/).length : 0,
      },
    };
  }

  const sections = extractSections(text);
  const allKeywords: string[] = [];
  
  // Weighted counts
  let supportScore = 0;
  let opposeScore = 0;
  let conditionalScore = 0;
  let noOpinionScore = 0;
  
  // Raw counts (for signals)
  let supportCount = 0;
  let opposeCount = 0;
  let conditionalCount = 0;
  let noOpinionCount = 0;

  for (const section of sections) {
    const weight = section.weight;
    
    // Step 1: Check negation patterns first
    const negationMatches = countMatches(section.content, NEGATION_PATTERNS);
    for (const [category, keywords] of negationMatches) {
      allKeywords.push(...keywords);
      const count = keywords.length;
      
      // Negation patterns are all "oppose" category
      if (category === 'oppose') {
        opposeScore += count * weight;
        opposeCount += count;
      }
    }
    
    // Step 2: Mask negation patterns to prevent double-counting
    const maskedContent = maskNegationPatterns(section.content);
    
    // Step 3: Check positive patterns on masked content
    const supportMatches = countMatches(maskedContent, SUPPORT_PATTERNS);
    for (const keywords of supportMatches.values()) {
      allKeywords.push(...keywords);
      supportScore += keywords.length * weight;
      supportCount += keywords.length;
    }
    
    const opposeMatches = countMatches(maskedContent, OPPOSE_PATTERNS);
    for (const keywords of opposeMatches.values()) {
      allKeywords.push(...keywords);
      opposeScore += keywords.length * weight;
      opposeCount += keywords.length;
    }
    
    const conditionalMatches = countMatches(maskedContent, CONDITIONAL_PATTERNS);
    for (const keywords of conditionalMatches.values()) {
      allKeywords.push(...keywords);
      conditionalScore += keywords.length * weight;
      conditionalCount += keywords.length;
    }
    
    const noOpinionMatches = countMatches(maskedContent, NO_OPINION_PATTERNS);
    for (const keywords of noOpinionMatches.values()) {
      allKeywords.push(...keywords);
      noOpinionScore += keywords.length * weight;
      noOpinionCount += keywords.length;
    }
  }

  // Determine section context for signals
  const sectionTypes = sections.map(s => s.type);
  let sectionContext: 'summary' | 'stance' | 'body' | 'mixed';
  if (sectionTypes.includes('summary') && sectionTypes.includes('stance')) {
    sectionContext = 'mixed';
  } else if (sectionTypes.includes('summary')) {
    sectionContext = 'summary';
  } else if (sectionTypes.includes('stance')) {
    sectionContext = 'stance';
  } else {
    sectionContext = 'body';
  }

  // Determine summary stance using weighted scores
  const summary = determineSummary(supportScore, opposeScore, conditionalScore, noOpinionScore);
  
  return {
    summary,
    signals: {
      support_count: supportCount,
      oppose_count: opposeCount,
      conditional_count: conditionalCount,
      no_opinion_count: noOpinionCount,
      keywords_found: [...new Set(allKeywords)], // Deduplicate
      section_context: sectionContext,
      word_count: text.split(/\s+/).length,
    },
  };
}

/**
 * Determine overall stance from weighted scores.
 * 
 * Decision matrix:
 * - Only no_opinion → neutral
 * - support > oppose × 2 → support
 * - oppose > support × 2 → oppose
 * - conditional >= both → conditional
 * - Both support AND oppose → mixed
 * - No keywords → neutral
 */
function determineSummary(
  support: number,
  oppose: number,
  conditional: number,
  noOpinion: number
): StanceSummary {
  const total = support + oppose + conditional + noOpinion;

  // No keywords found
  if (total === 0) return 'neutral';
  
  // Only "no opinion" keywords
  if (noOpinion > 0 && support === 0 && oppose === 0 && conditional === 0) {
    return 'neutral';
  }
  
  // Clear conditional stance
  if (conditional >= support && conditional >= oppose && conditional > 0) {
    return 'conditional';
  }
  
  // Clear majority (2x threshold)
  if (support > oppose * 2 && support > 0) return 'support';
  if (oppose > support * 2 && oppose > 0) return 'oppose';
  
  // Mixed signals
  if (support > 0 && oppose > 0) return 'mixed';
  
  // Single direction with lower confidence
  if (support > oppose) return 'support';
  if (oppose > support) return 'oppose';
  
  return 'neutral';
}

/**
 * Batch analyze multiple texts.
 * Useful for edge function processing.
 */
export function analyzeStanceBatch(
  items: Array<{ id: string; text: string }>
): Array<{ id: string; result: AnalysisResult }> {
  return items.map(item => ({
    id: item.id,
    result: analyzeStance(item.text),
  }));
}
