# Phase 5.2: Proposition Slice — Implementation Log

**Started:** 2025-12-03
**Updated:** 2025-12-04 (Pilot Complete)
**Status:** ✅ Pilot Validation Complete

---

## Pilot Implementation Summary

### Pilot Documents
- `Prop. 2025/26:36` — Kustbevakningens sjöövervakning (Försvarsdepartementet)
- `Prop. 2025/26:48` — Kriminalvårdens personuppgiftsbehandling (Justitiedepartementet)
- `Prop. 2025/26:42` — Straffansvar för olovlig finansiell verksamhet (Finansdepartementet)

### Pilot Results

| doc_number | has_text | timeline_events | ministers | status |
|------------|----------|-----------------|-----------|--------|
| Prop. 2025/26:36 | ✅ 91k chars | 2 | ✅ (corrected) | Pass |
| Prop. 2025/26:48 | ✅ 201k chars | 2 | ✅ (corrected) | Pass |
| Prop. 2025/26:42 | ✅ 185k chars | 2 | ✅ (corrected) | Pass |

### Timeline Agent v2.2 Results

All three propositions successfully extracted timeline events:
- Event types extracted: `proposition_submitted`, `law_enacted`
- Confidence: High for all events
- Citations: Valid page + excerpt for each

### Metadata Agent v2.2 Results

**Initial Run (Issue Identified):**
Ministers were incorrectly labeled as "utredare" due to SOU-specific prompt leaking into proposition processing.

**Root Cause:**
The Metadata Agent v1 was designed exclusively for SOUs and used investigator-specific role vocabulary regardless of document type.

**Fix Applied (v2.2.0):**
- Agent now detects `doc_type` from document metadata
- Uses document-type-specific prompts and tool schemas
- For propositions: extracts ministers with exact Swedish titles (justitieminister, försvarsminister, etc.)
- For SOUs: continues using utredare/särskild_utredare roles
- Added signature block analysis for propositions (last 10000 chars)

**Corrected Run Results:**
- Ministers now correctly identified with Swedish titles
- No misclassification into SOU roles
- All citations meet quality standards (50-500 char excerpts)

**UI Fix Applied (2025-12-04):**
- `PropositionAgentTest.tsx` minister count filter updated
- Now includes Swedish roles: `statsråd`, `departementschef` (not just "minister")
- UI correctly displays minister counts for all pilot propositions

---

## Implementation Details

### Task 1: Text Extraction Pipeline ✅

**Component:** `src/components/admin/PropositionTextExtractorTest.tsx`

Features:
- Loads pilot propositions from database
- Shows PDF/text status for each
- "Extract Text" button calls existing `process-sou-pdf` function
- Logging format:
  ```
  [Prop Text Extraction] Starting { docNumber, documentId }
  [Prop Text Extraction] Completed { success: true, textLength, pageCount }
  ```

### Task 2: Process Creation ✅

- Creates processes with `process_key` like `prop-2025-26-36`
- Sets `current_stage: 'proposition'`
- Links document via `process_documents` with `role: 'proposition'`

**RLS Fix Applied:** Added INSERT/UPDATE/DELETE policies for `process_documents` table (admin role only).

### Task 3: Task Queue Update ✅

- Changed `agent-timeline` to `agent-timeline-v2` for all document types
- Backwards compatible with existing SOUs/directives

### Task 4: Metadata Agent v2.2 Update ✅

**File:** `supabase/functions/agent-metadata/index.ts`

Key changes:
- Detects document type from `documents.doc_type`
- Uses separate prompts for propositions vs SOUs
- Proposition-specific role vocabulary: minister, statsråd, departementschef
- Analyzes signature blocks (end of document) for propositions
- Validates person entities with doc-type-aware rules

### Task 5: Admin UI Cleanup ✅

**File:** `src/pages/AdminScraper.tsx`

Reorganized into tabbed interface:
- **Propositions tab**: Phase 5.2 pipeline tools
- **SOUs & Directives tab**: Original pipeline tools
- **Data Explorer tab**: Task queue, processes, documents
- **System tab**: Version info and diagnostics

### Task 6: UI Minister Count Fix ✅

**File:** `src/components/admin/PropositionAgentTest.tsx`

Minister count filter now includes Swedish role vocabulary:
- `minister` (justitieminister, försvarsminister, etc.)
- `statsråd` (cabinet minister)
- `departementschef` (department head)

---

## Verification Queries

### Text Extraction

```sql
SELECT
  doc_number,
  pdf_url IS NOT NULL AS has_pdf,
  raw_content IS NOT NULL AS has_text,
  LENGTH(raw_content) AS text_length
FROM documents
WHERE doc_number IN ('Prop. 2025/26:36', 'Prop. 2025/26:48', 'Prop. 2025/26:42');
```

| doc_number | has_pdf | has_text | text_length |
|------------|---------|----------|-------------|
| Prop. 2025/26:36 | ✅ | ✅ | ~91,000 |
| Prop. 2025/26:48 | ✅ | ✅ | ~201,000 |
| Prop. 2025/26:42 | ✅ | ✅ | ~185,000 |

### Process Links

```sql
SELECT
  d.doc_number,
  p.process_key,
  p.current_stage
FROM documents d
JOIN process_documents pd ON pd.document_id = d.id
JOIN processes p ON p.id = pd.process_id
WHERE d.doc_number IN ('Prop. 2025/26:36', 'Prop. 2025/26:48', 'Prop. 2025/26:42');
```

| doc_number | process_key | current_stage |
|------------|-------------|---------------|
| Prop. 2025/26:36 | prop-2025-26-36 | proposition |
| Prop. 2025/26:48 | prop-2025-26-48 | proposition |
| Prop. 2025/26:42 | prop-2025-26-42 | proposition |

### Timeline Events

```sql
SELECT
  p.process_key,
  te.event_type,
  te.event_date,
  te.metadata->>'confidence' AS confidence
FROM processes p
JOIN timeline_events te ON te.process_id = p.id
WHERE p.process_key LIKE 'prop-%'
ORDER BY p.process_key, te.event_date;
```

All propositions have `proposition_submitted` and `law_enacted` events with high confidence.

### Entity Extraction (Post-Fix)

```sql
SELECT
  d.doc_number,
  e.name,
  e.role,
  e.entity_type
FROM documents d
JOIN entities e ON e.source_document_id = d.id
WHERE d.doc_number IN ('Prop. 2025/26:36', 'Prop. 2025/26:48', 'Prop. 2025/26:42')
  AND e.entity_type = 'person';
```

Ministers now have correct Swedish titles (e.g., "försvarsminister", "justitieminister") instead of "utredare".

---

## Scraper Version History

### v5.2.3 (2025-12-04) — In-Page Deduplication Fix

- Track `seenDocNumbers` Set during scrape
- Skip duplicates within same page
- Clear logging: `inserted`, `skippedExistingInDb`, `skippedDuplicateInPage`

### v5.2.2 (2025-12-04) — JSON API Pagination

Switched from HTML scraping to regeringen.se internal Filter API:
```
https://www.regeringen.se/Filter/GetFilteredItems?preFilteredCategories=1329&page=N
```

---

## Agent Version History

### Metadata Agent v2.2.0 (2025-12-04)

- Document-type-aware extraction
- Proposition-specific prompts for ministers
- SOU/directive prompts for investigators
- Signature block analysis for propositions
- Doc-type-aware validation rules

### Timeline Agent v2.2 (2025-12-03)

New event types for propositions:
- `proposition_submitted`
- `proposition_referred_to_riksdagen`
- `proposition_published`
- `government_decision_date`
- `impact_analysis_date`
- `law_enacted`

---

## Next Steps

### Ready for Scaling
- [x] Text extraction pilot (3 docs) ✅
- [x] Process creation pilot (3 docs) ✅
- [x] Timeline Agent pilot (3 docs) ✅
- [x] Metadata Agent pilot (initial run)
- [x] Fix proposition minister role classification ✅
- [x] Re-run Metadata Agent pilot (corrected) ✅

### Pending
- [ ] Scale to all propositions with PDFs (~53 documents)
- [ ] Run full batch text extraction
- [ ] Run full batch agent processing
- [ ] Document final results in PHASE_5.2_COMPLETION_SUMMARY.md

---

## Technical Notes

### URL Structure

The propositions listing lives at `https://www.regeringen.se/rattsliga-dokument/proposition/` with JSON API pagination.

### Lagstiftningskedja vs Genvägar

The "Lagstiftningskedja" section on proposition pages is the primary source of document-to-document references, handled by `genvag-classifier.ts`.

### Process Modeling Decision

Each proposition gets its own independent process (not merged with SOUs/directives). Case-level reconstruction is deferred to Phase 6.
