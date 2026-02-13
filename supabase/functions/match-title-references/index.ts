import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/http-utils.ts';

// ============================================
// Title Reference Matcher — Phase 6B.1 (Option A)
// Uses trigram similarity to match free-text Swedish titles
// against documents.title for unresolved references
// ============================================

/**
 * Decode HTML entities commonly found in scraped text
 */
function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  let result = text.replace(/&amp;/gi, '&');
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
    '&eacute;': 'é', '&#xE9;': 'é', '&#233;': 'é',
  };
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'gi'), char);
  }
  return result;
}

/**
 * Normalize a Swedish title for comparison:
 * - Decode HTML entities
 * - Lowercase, trim, collapse whitespace
 * - Strip "Remiss av promemorian" / "Remissinstanser för promemorian" prefixes
 */
function normalizeTitle(raw: string): string {
  let t = decodeHtmlEntities(raw).toLowerCase().trim();
  t = t.replace(/^remiss\s+av\s+promemorian\s+/i, '');
  t = t.replace(/^remissinstanser\s+för\s+promemorian\s+/i, '');
  t = t.replace(/^remiss\s+av\s+/i, '');
  t = t.replace(/\s+/g, ' ');
  return t;
}

/**
 * Check if a title is a generic heading (not a real document reference)
 */
function isGenericHeading(title: string): boolean {
  const normalized = title.toLowerCase().trim();
  return [
    'om lagstiftningen i sverige',
    'om lagstiftning i eu',
    'kommittédirektiv',
    'kommittedirektiv',
  ].includes(normalized);
}

/**
 * Extract the longest significant word from a title for ILIKE candidate search
 */
function extractSearchWords(title: string): string[] {
  const stopWords = new Set([
    'och', 'för', 'att', 'med', 'som', 'till', 'den', 'det', 'ett', 'en',
    'av', 'på', 'har', 'kan', 'ska', 'vid', 'från', 'eller', 'inte', 'nya',
    'om', 'mot', 'alla', 'genom', 'mellan', 'utan', 'vissa', 'samt',
    'tilläggsdirektiv', 'utredningen', 'kommittédirektiv', 'nationell',
    'remiss', 'promemorian', 'uppdrag',
  ]);
  return title
    .split(/\s+/)
    .filter(w => w.length > 4 && !stopWords.has(w))
    .sort((a, b) => b.length - a.length);
}

// ============================================
// Trigram Similarity (client-side)
// Mirrors pg_trgm's similarity() function
// ============================================

function generateTrigrams(text: string): Set<string> {
  const padded = `  ${text} `;
  const trigrams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    trigrams.add(padded.substring(i, i + 3));
  }
  return trigrams;
}

function trigramSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const trigramsA = generateTrigrams(a);
  const trigramsB = generateTrigrams(b);
  let intersection = 0;
  for (const t of trigramsA) {
    if (trigramsB.has(t)) intersection++;
  }
  const union = trigramsA.size + trigramsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun ?? true;
    const similarityThreshold = body.similarityThreshold ?? 0.35;

    console.log(`[match-title-refs] Starting (dryRun: ${dryRun}, threshold: ${similarityThreshold})`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Fetch ALL unresolved references
    let allUnresolved: Array<{
      id: string;
      target_doc_number: string;
      source_document_id: string;
      reference_type: string;
    }> = [];

    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('document_references')
        .select('id, target_doc_number, source_document_id, reference_type')
        .is('target_document_id', null)
        .not('target_doc_number', 'is', null)
        .range(page * pageSize, (page + 1) * pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allUnresolved = allUnresolved.concat(data);
      if (data.length < pageSize) break;
      page++;
    }

    // Filter to title-only refs (no numeric doc number pattern, not generic)
    const docNumPattern = /\d{4}[:/]\d+/;
    const titleOnlyRefs = allUnresolved.filter(ref => {
      if (!ref.target_doc_number) return false;
      if (docNumPattern.test(ref.target_doc_number)) return false;
      if (ref.target_doc_number.length <= 10) return false;
      if (isGenericHeading(decodeHtmlEntities(ref.target_doc_number))) return false;
      return true;
    });

    console.log(`[match-title-refs] Found ${titleOnlyRefs.length} title-only refs`);

    if (titleOnlyRefs.length === 0) {
      return createSuccessResponse({
        message: 'No title-only references found',
        totalUnresolved: allUnresolved.length,
        titleOnly: 0,
        matched: 0,
      });
    }

    // Step 2: Deduplicate by normalized title
    const titleGroups = new Map<string, typeof titleOnlyRefs>();
    for (const ref of titleOnlyRefs) {
      const normalized = normalizeTitle(ref.target_doc_number);
      if (!titleGroups.has(normalized)) {
        titleGroups.set(normalized, []);
      }
      titleGroups.get(normalized)!.push(ref);
    }

    console.log(`[match-title-refs] ${titleGroups.size} unique titles to match`);

    // Step 3: For each unique title, find candidates via ILIKE then rank by trigram similarity
    const results = {
      processed: 0,
      matched: 0,
      noMatch: 0,
      matches: [] as Array<{
        refId: string;
        originalTitle: string;
        normalizedTitle: string;
        matchedDocId: string;
        matchedDocTitle: string;
        matchedDocNumber: string;
        similarity: number;
      }>,
      failures: [] as Array<{
        refId: string;
        originalTitle: string;
        normalizedTitle: string;
        bestSimilarity: number | null;
        bestCandidate: string | null;
        reason: string;
      }>,
    };

    for (const [normalizedTitle, refs] of titleGroups) {
      results.processed += refs.length;

      // Extract search words from the normalized title
      const searchWords = extractSearchWords(normalizedTitle);
      if (searchWords.length === 0) {
        for (const ref of refs) {
          results.noMatch++;
          results.failures.push({
            refId: ref.id,
            originalTitle: ref.target_doc_number,
            normalizedTitle,
            bestSimilarity: null,
            bestCandidate: null,
            reason: 'no_search_words',
          });
        }
        continue;
      }

      // Use the two longest significant words for ILIKE candidate search
      const word1 = `%${searchWords[0]}%`;
      const word2 = searchWords.length > 1 ? `%${searchWords[1]}%` : null;

      let candidateDocs: Array<{ id: string; title: string; doc_number: string; doc_type: string }> = [];

      // Try two-word ILIKE first
      if (word2) {
        const { data, error } = await supabase
          .from('documents')
          .select('id, title, doc_number, doc_type')
          .ilike('title', word1)
          .ilike('title', word2)
          .limit(30);
        if (!error && data && data.length > 0) {
          candidateDocs = data;
        }
      }

      // Fallback to single-word ILIKE
      if (candidateDocs.length === 0) {
        const { data, error } = await supabase
          .from('documents')
          .select('id, title, doc_number, doc_type')
          .ilike('title', word1)
          .limit(50);
        if (!error && data) {
          candidateDocs = data;
        }
      }

      if (candidateDocs.length === 0) {
        for (const ref of refs) {
          results.noMatch++;
          if (results.failures.length < 40) {
            results.failures.push({
              refId: ref.id,
              originalTitle: ref.target_doc_number,
              normalizedTitle,
              bestSimilarity: null,
              bestCandidate: null,
              reason: `no_candidates (searched: ${searchWords.slice(0, 2).join(', ')})`,
            });
          }
        }
        continue;
      }

      // Rank candidates by trigram similarity
      let bestMatch: { docId: string; title: string; docNumber: string; similarity: number } | null = null;
      let bestSim = 0;
      let bestTitle = '';

      for (const doc of candidateDocs) {
        const docTitleNorm = normalizeTitle(doc.title);
        const sim = trigramSimilarity(normalizedTitle, docTitleNorm);
        if (sim > bestSim) {
          bestSim = sim;
          bestTitle = doc.title;
        }
        if (sim >= similarityThreshold && (!bestMatch || sim > bestMatch.similarity)) {
          bestMatch = { docId: doc.id, title: doc.title, docNumber: doc.doc_number, similarity: sim };
        }
      }

      if (bestMatch) {
        for (const ref of refs) {
          results.matched++;
          results.matches.push({
            refId: ref.id,
            originalTitle: ref.target_doc_number,
            normalizedTitle,
            matchedDocId: bestMatch.docId,
            matchedDocTitle: bestMatch.title,
            matchedDocNumber: bestMatch.docNumber,
            similarity: bestMatch.similarity,
          });
        }
      } else {
        for (const ref of refs) {
          results.noMatch++;
          if (results.failures.length < 40) {
            results.failures.push({
              refId: ref.id,
              originalTitle: ref.target_doc_number,
              normalizedTitle,
              bestSimilarity: bestSim > 0 ? Math.round(bestSim * 1000) / 1000 : null,
              bestCandidate: bestTitle || null,
              reason: `below_threshold (best: ${Math.round(bestSim * 1000) / 1000})`,
            });
          }
        }
      }
    }

    // Step 4: Write matches to document_relationships (if not dry run)
    let relationshipsCreated = 0;
    let refsUpdated = 0;
    if (!dryRun && results.matches.length > 0) {
      const seen = new Set<string>();
      for (const match of results.matches) {
        const ref = titleOnlyRefs.find(r => r.id === match.refId);
        if (!ref) continue;

        const key = `${ref.source_document_id}|${match.matchedDocId}`;
        if (!seen.has(key)) {
          seen.add(key);
          const { error: insertError } = await supabase
            .from('document_relationships')
            .upsert({
              source_document_id: ref.source_document_id,
              target_document_id: match.matchedDocId,
              relationship_type: 'references',
              confidence_score: match.similarity,
              confidence_class: match.similarity >= 0.7 ? 'high' : 'medium',
              derived_by: 'system',
              source_reference_id: match.refId,
              evidence_details: {
                method: 'trigram_title_match',
                original_title: match.originalTitle,
                matched_title: match.matchedDocTitle,
                similarity_score: match.similarity,
                threshold: similarityThreshold,
              },
            }, {
              onConflict: 'source_document_id,target_document_id,relationship_type',
              ignoreDuplicates: true,
            });
          if (!insertError) relationshipsCreated++;
        }

        // Update the reference to link it
        const { error: updateError } = await supabase
          .from('document_references')
          .update({ target_document_id: match.matchedDocId })
          .eq('id', match.refId);
        if (!updateError) refsUpdated++;
      }
    }

    console.log(`[match-title-refs] Done: ${results.matched} matched, ${results.noMatch} no match`);

    return createSuccessResponse({
      dryRun,
      similarityThreshold,
      totalUnresolved: allUnresolved.length,
      titleOnlyCount: titleOnlyRefs.length,
      uniqueTitles: titleGroups.size,
      processed: results.processed,
      matched: results.matched,
      noMatch: results.noMatch,
      relationshipsCreated,
      refsUpdated,
      matches: results.matches,
      failures: results.failures,
    });

  } catch (error) {
    console.error('Error in match-title-references:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse('title_match_error', errorMessage, 500);
  }
});
