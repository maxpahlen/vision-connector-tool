import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/http-utils.ts';

// ============================================
// Reference Resolution Utilities
// Phase 6A.1 — Deterministic document linking
// ============================================

/**
 * Decode HTML entities commonly found in scraped text
 * Handles both numeric (&#xF6;) and named (&ouml;) entities
 */
function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  
  // First pass: decode &amp; back to & (handles double-encoding from scrapers)
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
 * Convert Riksdag session year (e.g., "2024/25") to the 2-char rm code used in doc_numbers.
 * 
 * Mapping is based on observed data:
 *   2020/21 → H8, 2021/22 → H9, 2022/23 → HA, 2023/24 → HB, 2024/25 → HC, 2025/26 → HD
 * 
 * Algorithm: anchor 2020 = index 260 (H=7th letter × 36 + 8), then offset by year diff.
 * Second char cycles 0-9, A-Z (36 values), first char increments A-Z.
 */
function sessionToRiksdagCode(startYear: number): string | null {
  const ANCHOR_YEAR = 2020;
  const ANCHOR_INDEX = 7 * 36 + 8; // H8 = 260
  const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  
  const offset = startYear - ANCHOR_YEAR;
  const absIndex = ANCHOR_INDEX + offset;
  
  if (absIndex < 0 || absIndex >= 26 * 36) return null;
  
  const firstCharIndex = Math.floor(absIndex / 36);
  const secondCharIndex = absIndex % 36;
  
  const firstChar = String.fromCharCode(65 + firstCharIndex); // A=0, B=1, ...
  const secondChar = CHARS[secondCharIndex];
  
  return `${firstChar}${secondChar}`;
}

/**
 * Extract clean document number from text.
 * Returns only the canonical number in the format stored in documents.doc_number.
 * 
 * Supported formats:
 * - SOU YYYY:NN
 * - Dir. YYYY:NN
 * - Prop. YYYY/YY:NN
 * - Ds YYYY:NN
 * - Bet. YYYY/YY:CommNN → converted to Riksdagen code (e.g., HC01FiU21)
 * - FPM YYYY/YY:NN
 * - Ministry dossier (e.g., Ju2025/00680)
 */
function extractDocNumber(urlOrText: string): { docNumber: string; evidenceType: string } | null {
  const text = decodeHtmlEntities(urlOrText);

  // Try Bet. (committee report) pattern — convert to Riksdagen doc_number format
  // Bet. 2024/25:FiU21 → HC01FiU21
  const betMatch = text.match(/\bBet\.?\s*(\d{4})\s*[\/\-]\s*(\d{2})\s*[:\-]\s*([A-Za-z]+\d+)/i);
  if (betMatch) {
    const startYear = parseInt(betMatch[1]);
    const rmCode = sessionToRiksdagCode(startYear);
    if (rmCode) {
      return { docNumber: `${rmCode}01${betMatch[3]}`, evidenceType: 'bet_pattern' };
    }
  }

  // Try SOU pattern (also matches title-embedded: "Some title, SOU 2025:72")
  const souMatch = text.match(/\bSOU\s*(\d{4})\s*[:\-]\s*(\d+)/i);
  if (souMatch) {
    return { docNumber: `SOU ${souMatch[1]}:${souMatch[2]}`, evidenceType: 'sou_pattern' };
  }

  // Try Directive pattern (also matches title-embedded)
  const dirMatch = text.match(/\bDir\.?\s*(\d{4})\s*[:\-]\s*(\d+)/i);
  if (dirMatch) {
    return { docNumber: `Dir. ${dirMatch[1]}:${dirMatch[2]}`, evidenceType: 'dir_pattern' };
  }

  // Try Proposition pattern (also matches title-embedded)
  const propMatch = text.match(/\bProp\.?\s*(\d{4})\s*[\/\-]\s*(\d{2})\s*[:\-]\s*(\d+)/i);
  if (propMatch) {
    return { docNumber: `Prop. ${propMatch[1]}/${propMatch[2]}:${propMatch[3]}`, evidenceType: 'prop_pattern' };
  }

  // Try Ds pattern
  const dsMatch = text.match(/\bDs\s*(\d{4})\s*[:\-]\s*(\d+)/i);
  if (dsMatch) {
    return { docNumber: `Ds ${dsMatch[1]}:${dsMatch[2]}`, evidenceType: 'ds_pattern' };
  }

  // Try FPM pattern
  const fpmMatch = text.match(/\b(\d{4}\/\d{2})\s*[:\-]?\s*FPM\s*(\d+)/i);
  if (fpmMatch) {
    return { docNumber: `${fpmMatch[1]}:FPM${fpmMatch[2]}`, evidenceType: 'fpm_pattern' };
  }

  // Try Ministry dossier number (e.g., Ju2025/00680)
  const dossierMatch = text.match(/\b([A-Za-z]{1,3})(\d{4})\/(\d{4,5})\b/);
  if (dossierMatch) {
    const ministryCode = dossierMatch[1].charAt(0).toUpperCase() + dossierMatch[1].slice(1).toLowerCase();
    return { docNumber: `${ministryCode}${dossierMatch[2]}/${dossierMatch[3]}`, evidenceType: 'dossier_pattern' };
  }

  return null;
}

/**
 * Normalize doc_number for comparison.
 * Makes matching case-insensitive and whitespace-tolerant.
 */
function normalizeDocNumber(docNumber: string): string {
  return docNumber
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\.\s*/g, '. ');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = body.batchSize || 500;
    const dryRun = body.dryRun || false;

    console.log(`[resolve-refs] Starting (batchSize: ${batchSize}, dryRun: ${dryRun})`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch unresolved references (paginated to avoid 1000-row limit)
    let allUnresolved: Array<{
      id: string;
      target_doc_number: string | null;
      target_url: string | null;
      reference_type: string;
    }> = [];
    
    let page = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from('document_references')
        .select('id, target_doc_number, target_url, reference_type')
        .is('target_document_id', null)
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;
      allUnresolved = allUnresolved.concat(data);
      if (data.length < pageSize) break;
      page++;
    }

    if (allUnresolved.length === 0) {
      return createSuccessResponse({
        message: 'No unresolved references found',
        processed: 0,
        resolved: 0,
      });
    }

    console.log(`[resolve-refs] Found ${allUnresolved.length} unresolved references`);

    // Fetch all documents for matching (paginated)
    let allDocuments: Array<{ id: string; doc_number: string; doc_type: string }> = [];
    page = 0;
    while (true) {
      const { data, error } = await supabase
        .from('documents')
        .select('id, doc_number, doc_type')
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;
      allDocuments = allDocuments.concat(data);
      if (data.length < pageSize) break;
      page++;
    }

    // Build normalized lookup map
    const docLookup = new Map<string, string>();
    for (const doc of allDocuments) {
      if (doc.doc_number) {
        docLookup.set(normalizeDocNumber(doc.doc_number), doc.id);
      }
    }

    console.log(`[resolve-refs] Built lookup with ${docLookup.size} documents`);

    // Process ALL refs in memory first, then batch DB updates
    const toProcess = allUnresolved.slice(0, batchSize);

    const results = {
      processed: 0,
      resolved: 0,
      noMatch: 0,
      extractionFailed: 0,
      resolvedByEvidence: {} as Record<string, number>,
      failureReasons: {} as Record<string, number>,
      sampleUpdates: [] as Array<{ id: string; oldDocNumber: string | null; newDocNumber: string; targetDocumentId: string; evidenceType: string }>,
      sampleFailures: [] as Array<{ id: string; reason: string; targetDocNumber: string | null; extracted: string | null }>,
    };

    const incrementMap = (map: Record<string, number>, key: string) => {
      map[key] = (map[key] || 0) + 1;
    };

    // Collect updates in memory
    const resolvedUpdates: Array<{ id: string; docNumber: string; targetDocId: string }> = [];
    const cleanupUpdates: Array<{ id: string; docNumber: string }> = [];

    for (const ref of toProcess) {
      results.processed++;
      const sourceText = ref.target_doc_number || ref.target_url || '';

      // --- Phase 6A.5: Direct corpus match FIRST ---
      // Try the raw target_doc_number directly against the lookup (catches Riksdagen codes like H501JuU27)
      if (ref.target_doc_number) {
        const directNorm = normalizeDocNumber(ref.target_doc_number);
        const directMatch = docLookup.get(directNorm);
        if (directMatch) {
          results.resolved++;
          incrementMap(results.resolvedByEvidence, 'direct_match');
          resolvedUpdates.push({ id: ref.id, docNumber: ref.target_doc_number, targetDocId: directMatch });
          if (results.sampleUpdates.length < 20) {
            results.sampleUpdates.push({ id: ref.id, oldDocNumber: ref.target_doc_number, newDocNumber: ref.target_doc_number, targetDocumentId: directMatch, evidenceType: 'direct_match' });
          }
          continue;
        }
      }

      // --- Pattern extraction (existing + title-embedded) ---
      const extracted = extractDocNumber(sourceText);

      if (!extracted) {
        results.extractionFailed++;
        incrementMap(results.failureReasons, 'extraction_failed');
        if (results.sampleFailures.length < 20) {
          results.sampleFailures.push({ id: ref.id, reason: 'No extractable doc number pattern', targetDocNumber: ref.target_doc_number, extracted: null });
        }
        continue;
      }

      const { docNumber, evidenceType } = extracted;
      const normalizedClean = normalizeDocNumber(docNumber);
      const matchedDocId = docLookup.get(normalizedClean);

      if (!matchedDocId) {
        results.noMatch++;
        incrementMap(results.failureReasons, `no_corpus_match_${evidenceType}`);
        if (results.sampleFailures.length < 20) {
          results.sampleFailures.push({ id: ref.id, reason: 'Extracted but no corpus match', targetDocNumber: ref.target_doc_number, extracted: docNumber });
        }
        if (ref.target_doc_number !== docNumber) {
          cleanupUpdates.push({ id: ref.id, docNumber });
        }
        continue;
      }

      results.resolved++;
      incrementMap(results.resolvedByEvidence, evidenceType);
      resolvedUpdates.push({ id: ref.id, docNumber, targetDocId: matchedDocId });
      if (results.sampleUpdates.length < 20) {
        results.sampleUpdates.push({ id: ref.id, oldDocNumber: ref.target_doc_number, newDocNumber: docNumber, targetDocumentId: matchedDocId, evidenceType });
      }
    }

    // Execute DB updates in batches of 50 (parallel within batch)
    // Uses individual error handling to skip unique constraint violations
    // (e.g., when shortening "Dir. 2024:72 Title..." to "Dir. 2024:72" 
    //  but that (source_document_id, target_doc_number) pair already exists)
    const dbErrors: Array<{ id: string; error: string }> = [];
    if (!dryRun) {
      const DB_BATCH = 50;
      for (let i = 0; i < resolvedUpdates.length; i += DB_BATCH) {
        const batch = resolvedUpdates.slice(i, i + DB_BATCH);
        const batchResults = await Promise.all(batch.map(async u => {
          const { error } = await supabase.from('document_references')
            .update({ target_doc_number: u.docNumber, target_document_id: u.targetDocId })
            .eq('id', u.id);
          if (error) {
            dbErrors.push({ id: u.id, error: error.message });
            return false;
          }
          return true;
        }));
        // Count actual successful writes
        results.resolved = results.resolved - batchResults.filter(r => !r).length;
      }
      for (let i = 0; i < cleanupUpdates.length; i += DB_BATCH) {
        const batch = cleanupUpdates.slice(i, i + DB_BATCH);
        await Promise.all(batch.map(async u => {
          const { error } = await supabase.from('document_references')
            .update({ target_doc_number: u.docNumber })
            .eq('id', u.id);
          if (error) dbErrors.push({ id: u.id, error: error.message });
        }));
      }
    }

    console.log(`[resolve-refs] Done: ${results.resolved} resolved, ${results.noMatch} no match, ${results.extractionFailed} extraction failed`);

    return createSuccessResponse({
      dryRun,
      totalUnresolved: allUnresolved.length,
      processed: results.processed,
      resolved: results.resolved,
      noMatch: results.noMatch,
      extractionFailed: results.extractionFailed,
      resolvedByEvidence: results.resolvedByEvidence,
      failureReasons: results.failureReasons,
      sampleUpdates: results.sampleUpdates,
      sampleFailures: results.sampleFailures,
      dbErrors: dbErrors.length > 0 ? { count: dbErrors.length, samples: dbErrors.slice(0, 10) } : undefined,
    });

  } catch (error) {
    console.error('Error in resolve-document-references:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse('resolution_error', errorMessage, 500);
  }
});
