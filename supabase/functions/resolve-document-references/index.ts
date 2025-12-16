import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/http-utils.ts';

/**
 * Decode HTML entities commonly found in scraped text
 * P2 FIX: Handles both numeric (&#xF6;) and named (&ouml;) entities
 */
function decodeHtmlEntities(text: string): string {
  if (!text) return text;
  
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
 * Extract clean document number from text
 * P2 FIX: Improved regex patterns with HTML entity decoding
 * Returns only the canonical number (e.g., "Dir. 2023:171"), not full titles
 */
function extractDocNumber(urlOrText: string): string | null {
  // Decode HTML entities first
  const text = decodeHtmlEntities(urlOrText);
  
  // Try SOU pattern - STRICT
  const souMatch = text.match(/\bSOU\s*(\d{4})\s*[:\-]\s*(\d+)/i);
  if (souMatch) {
    return `SOU ${souMatch[1]}:${souMatch[2]}`;
  }

  // Try Directive pattern - STRICT
  const dirMatch = text.match(/\bDir\.?\s*(\d{4})\s*[:\-]\s*(\d+)/i);
  if (dirMatch) {
    return `Dir. ${dirMatch[1]}:${dirMatch[2]}`;
  }

  // Try Proposition pattern - STRICT
  const propMatch = text.match(/\bProp\.?\s*(\d{4})\s*[\/\-]\s*(\d{2})\s*[:\-]\s*(\d+)/i);
  if (propMatch) {
    return `Prop. ${propMatch[1]}/${propMatch[2]}:${propMatch[3]}`;
  }

  // Try Ds pattern - STRICT
  const dsMatch = text.match(/\bDs\s*(\d{4})\s*[:\-]\s*(\d+)/i);
  if (dsMatch) {
    return `Ds ${dsMatch[1]}:${dsMatch[2]}`;
  }

  // Try FPM pattern (Faktapromemoria)
  const fpmMatch = text.match(/\b(\d{4}\/\d{2})\s*[:\-]?\s*FPM\s*(\d+)/i);
  if (fpmMatch) {
    return `${fpmMatch[1]}:FPM${fpmMatch[2]}`;
  }

  return null;
}

/**
 * Normalize doc_number for comparison
 * Handles variations like "SOU 2024:55" vs "SOU 2024:55" or "Prop. 2025/26:36"
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
    const batchSize = body.batchSize || 100;
    const dryRun = body.dryRun || false;

    console.log(`[resolve-document-references] Starting batch resolution (batchSize: ${batchSize}, dryRun: ${dryRun})`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch unresolved document references
    const { data: unresolvedRefs, error: fetchError } = await supabase
      .from('document_references')
      .select('id, target_doc_number, target_url, reference_type')
      .is('target_document_id', null)
      .limit(batchSize);

    if (fetchError) {
      console.error('Error fetching unresolved references:', fetchError);
      throw fetchError;
    }

    if (!unresolvedRefs || unresolvedRefs.length === 0) {
      return createSuccessResponse({
        message: 'No unresolved references found',
        processed: 0,
        resolved: 0,
        failed: 0,
      });
    }

    console.log(`[resolve-document-references] Found ${unresolvedRefs.length} unresolved references`);

    // Fetch all documents for matching
    const { data: allDocuments, error: docsError } = await supabase
      .from('documents')
      .select('id, doc_number, doc_type');

    if (docsError) {
      console.error('Error fetching documents:', docsError);
      throw docsError;
    }

    // Create normalized lookup map
    const docLookup = new Map<string, string>();
    for (const doc of allDocuments || []) {
      if (doc.doc_number) {
        const normalized = normalizeDocNumber(doc.doc_number);
        docLookup.set(normalized, doc.id);
      }
    }

    console.log(`[resolve-document-references] Built lookup map with ${docLookup.size} documents`);

    const results = {
      processed: 0,
      resolved: 0,
      alreadyClean: 0,
      noMatch: 0,
      extractionFailed: 0,
      updates: [] as Array<{ id: string; oldDocNumber: string | null; newDocNumber: string; targetDocumentId: string }>,
      failures: [] as Array<{ id: string; reason: string; targetDocNumber: string | null }>,
    };

    for (const ref of unresolvedRefs) {
      results.processed++;

      // Try to extract clean doc number from existing target_doc_number or target_url
      const sourceText = ref.target_doc_number || ref.target_url || '';
      const cleanDocNumber = extractDocNumber(sourceText);

      if (!cleanDocNumber) {
        results.extractionFailed++;
        results.failures.push({
          id: ref.id,
          reason: 'Could not extract doc number from text',
          targetDocNumber: ref.target_doc_number,
        });
        continue;
      }

      // Check if doc number was already clean (no change needed)
      const wasAlreadyClean = ref.target_doc_number === cleanDocNumber;
      if (wasAlreadyClean) {
        results.alreadyClean++;
      }

      // Try to find matching document
      const normalizedClean = normalizeDocNumber(cleanDocNumber);
      const matchedDocId = docLookup.get(normalizedClean);

      if (!matchedDocId) {
        results.noMatch++;
        results.failures.push({
          id: ref.id,
          reason: `No document found for ${cleanDocNumber}`,
          targetDocNumber: cleanDocNumber,
        });

        // Still update the target_doc_number to clean version if it changed
        if (!wasAlreadyClean && !dryRun) {
          await supabase
            .from('document_references')
            .update({ target_doc_number: cleanDocNumber })
            .eq('id', ref.id);
        }
        continue;
      }

      // Success - update the reference
      results.resolved++;
      results.updates.push({
        id: ref.id,
        oldDocNumber: ref.target_doc_number,
        newDocNumber: cleanDocNumber,
        targetDocumentId: matchedDocId,
      });

      if (!dryRun) {
        const { error: updateError } = await supabase
          .from('document_references')
          .update({
            target_doc_number: cleanDocNumber,
            target_document_id: matchedDocId,
          })
          .eq('id', ref.id);

        if (updateError) {
          console.error(`Failed to update reference ${ref.id}:`, updateError);
        }
      }
    }

    console.log(`[resolve-document-references] Completed: ${results.resolved} resolved, ${results.noMatch} no match, ${results.extractionFailed} extraction failed`);

    return createSuccessResponse({
      dryRun,
      processed: results.processed,
      resolved: results.resolved,
      alreadyClean: results.alreadyClean,
      noMatch: results.noMatch,
      extractionFailed: results.extractionFailed,
      sampleUpdates: results.updates.slice(0, 10),
      sampleFailures: results.failures.slice(0, 10),
    });

  } catch (error) {
    console.error('Error in resolve-document-references:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return createErrorResponse('resolution_error', errorMessage, 500);
  }
});
