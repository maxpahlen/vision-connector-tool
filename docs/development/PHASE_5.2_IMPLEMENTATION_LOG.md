# Phase 5.2: Proposition Slice — Implementation Log

**Started:** 2025-12-03
**Updated:** 2025-12-04

---

## Pilot Implementation (2025-12-04)

### Overview

Implementing end-to-end proposition processing with a 3-document pilot:
- `Prop. 2025/26:36` — Kustbevakningens sjöövervakning (Försvarsdepartementet)
- `Prop. 2025/26:48` — Kriminalvårdens personuppgiftsbehandling (Justitiedepartementet)
- `Prop. 2025/26:42` — Straffansvar för olovlig finansiell verksamhet (Finansdepartementet)

### Task 1: Text Extraction Pipeline

**Component:** `src/components/admin/PropositionTextExtractorTest.tsx`

Features:
- Loads pilot propositions from database
- Shows PDF/text status for each
- "Extract Text" button calls existing `process-sou-pdf` function
- Logging format:
  ```
  [Prop Text Extraction] Starting { docNumber, documentId }
  [Prop Text Extraction] Completed { success: true, textLength, pageCount }
  [Prop Text Extraction] FAILED { error, docNumber }
  ```

**Status:** ✅ Implemented

### Task 2: Process Creation

**In same component:** `PropositionTextExtractorTest.tsx`

- Creates processes with `process_key` like `prop-2025-26-36`
- Sets `current_stage: 'proposition'`
- Links document via `process_documents` with `role: 'proposition'`
- Logging format:
  ```
  [Prop Process Setup] Created process { processId, processKey, docNumber }
  ```

**Status:** ✅ Implemented

### Task 3: Task Queue Update

**File:** `supabase/functions/process-task-queue/index.ts`

- Changed `agent-timeline` to `agent-timeline-v2` on line 160
- Backwards compatible with existing SOUs/directives (v2 already validated)

**Status:** ✅ Implemented

### Task 4: Agent Pilot Test UI

**Component:** `src/components/admin/PropositionAgentTest.tsx`

Features:
- Shows all 3 pilot propositions with status:
  - has_pdf
  - has_text
  - has_process
  - timeline_events count
  - ministers count
- Individual agent buttons per document
- "Run All Agents" batch button
- Verification summary table
- Logging format:
  ```
  [Timeline Agent v2.2] Starting for { docNumber, processId }
  [Timeline Agent v2.2] Extracted events: N
  [Timeline Agent v2.2] Inserted: X, Updated: Y, Skipped: Z
  
  [Metadata Agent v2.2] Starting for { docNumber, processId }
  [Metadata Agent v2.2] Extracted ministers: M, totalEntities: E
  [Metadata Agent v2.2] Completed
  ```

**Status:** ✅ Implemented

### Task 5: Documentation

Updated files:
- `docs/development/PHASE_5.2_IMPLEMENTATION_LOG.md` (this file)
- `docs/development/PHASE_5.2_PROPOSITION_SLICE_PLAN.md`

**Status:** ✅ Implemented

---

## Pilot Results

### Verification Query: Text Extraction

```sql
SELECT
  doc_number,
  pdf_url IS NOT NULL AS has_pdf,
  raw_content IS NOT NULL AS has_text
FROM documents
WHERE doc_number IN ('Prop. 2025/26:36', 'Prop. 2025/26:48', 'Prop. 2025/26:42');
```

| doc_number | has_pdf | has_text |
|------------|---------|----------|
| Prop. 2025/26:36 | _pending_ | _pending_ |
| Prop. 2025/26:48 | _pending_ | _pending_ |
| Prop. 2025/26:42 | _pending_ | _pending_ |

### Verification Query: Process Links

```sql
SELECT
  d.doc_number,
  p.id AS process_id,
  p.process_key,
  p.current_stage
FROM documents d
JOIN process_documents pd ON pd.document_id = d.id
JOIN processes p ON p.id = pd.process_id
WHERE d.doc_number IN ('Prop. 2025/26:36', 'Prop. 2025/26:48', 'Prop. 2025/26:42');
```

| doc_number | process_key | current_stage |
|------------|-------------|---------------|
| Prop. 2025/26:36 | _pending_ | _pending_ |
| Prop. 2025/26:48 | _pending_ | _pending_ |
| Prop. 2025/26:42 | _pending_ | _pending_ |

### Verification Query: Timeline Events

```sql
SELECT
  p.process_key,
  COUNT(*) FILTER (WHERE te.event_type = 'proposition_published') AS prop_published,
  COUNT(*) AS total_events
FROM processes p
JOIN timeline_events te ON te.process_id = p.id
WHERE p.process_key IN ('prop-2025-26-36', 'prop-2025-26-48', 'prop-2025-26-42')
GROUP BY p.process_key;
```

_Results pending pilot execution_

### Verification Query: Entities

```sql
SELECT
  d.doc_number,
  COUNT(*) FILTER (WHERE e.entity_type = 'person') AS persons,
  COUNT(*) FILTER (WHERE e.entity_type = 'person' AND e.role ILIKE '%minister%') AS ministers
FROM documents d
LEFT JOIN entities e ON e.source_document_id = d.id
WHERE d.doc_number IN ('Prop. 2025/26:36', 'Prop. 2025/26:48', 'Prop. 2025/26:42')
GROUP BY d.doc_number;
```

_Results pending pilot execution_

---

## Scraper Version History

### v5.2.3 (2025-12-04) — In-Page Deduplication Fix

Added in-page deduplication to prevent duplicate propositions within the same scrape run.

**Changes:**
- Track `seenDocNumbers` Set during scrape
- Skip duplicates within same page with `skippedDuplicateInPage` counter
- Clear logging: `inserted`, `skippedExistingInDb`, `skippedDuplicateInPage`

### v5.2.2 (2025-12-04) — JSON API Pagination

**Critical Fix**: Switched from HTML scraping to regeringen.se internal Filter API.

**Problem**: The `/rattsliga-dokument/proposition/?page=N` URL does NOT work—regeringen.se uses client-side JavaScript for pagination, limiting HTML scraping to first ~20 items.

**Solution**: Use the internal AJAX endpoint:
```
https://www.regeringen.se/Filter/GetFilteredItems
  ?lang=sv
  &filterType=Taxonomy
  &filterByType=FilterablePageBase
  &preFilteredCategories=1329  // Category ID for propositions
  &page=N
```

This API returns proper paginated results and supports real `page=N` parameter.

**Changes**:
- `buildFilterApiUrl(page)` constructs the API URL
- `parseFilterApiResponse()` handles JSON or HTML responses
- Added debug logging for response structure
- Kept existing detail-page PDF extraction (pdf-scorer)
- Kept Lagstiftningskedja link extraction

---

## Implementation Summary

### 1. Proposition Scraper v5.2

**File:** `supabase/functions/scrape-proposition-index/index.ts`

Updated to use the correct URL structure:
- **Index URL:** `https://www.regeringen.se/rattsliga-dokument/proposition/`
- **Pagination:** JSON API with `page=N`
- **Features:**
  - Parses proposition listing from Filter API
  - Fetches detail pages for PDF URL and Lagstiftningskedja
  - Creates document_references using genvag-classifier
  - Rate limiting (500ms between requests)
  - In-page deduplication

### 2. Genvägar Classifier

**File:** `supabase/functions/_shared/genvag-classifier.ts`

Classification rules implemented:
| URL Pattern | Reference Type |
|-------------|----------------|
| `/statens-offentliga-utredningar/` | `based_on` |
| `/kommittedirektiv/` | `cites` |
| `/remisser/` (response) | `responds_to` |
| "ändring", "ändringar" | `amends` |
| Everything else | `related` |

### 3. Timeline Agent v2.2 Event Types

**File:** `supabase/functions/agent-timeline-v2/index.ts`

New event types added:
```typescript
const EVENT_TYPES = [
  // Original
  'sou_published',
  'directive_issued',
  'committee_formed',
  'remiss_period_start',
  'remiss_period_end',
  // Proposition (v2.2)
  'proposition_submitted',
  'proposition_referred_to_riksdagen',
  'proposition_published',
  'government_decision_date',
  'impact_analysis_date',
  'law_enacted'
] as const;
```

### 4. Process Stage Machine Updates

**File:** `supabase/functions/_shared/process-stage-machine.ts`

- Added `enacted` stage as proper lifecycle endpoint
- Kept `law` as legacy alias for backwards compatibility
- Updated stage order for valid transitions

### 5. Admin UI Components

**Files:**
- `src/components/admin/PropositionScraperTest.tsx` — Scraper testing
- `src/components/admin/PropositionTextExtractorTest.tsx` — Text extraction + process setup
- `src/components/admin/PropositionAgentTest.tsx` — Agent pilot testing

### 6. Page Integration

**File:** `src/pages/AdminScraper.tsx`

All proposition components added to admin panel.

---

## Next Steps

After pilot validation:
1. [ ] Scale to all propositions with PDFs (~53 documents)
2. [ ] Run full batch text extraction
3. [ ] Run full batch agent processing
4. [ ] Document final results in PHASE_5.2_COMPLETION_SUMMARY.md

---

## Technical Notes

### URL Structure Clarification

The original plan mentioned `https://www.regeringen.se/propositioner/` but the actual propositions listing lives at `https://www.regeringen.se/rattsliga-dokument/proposition/`.

The scraper now uses the correct URL with JSON API pagination.

### Lagstiftningskedja vs Genvägar

On proposition pages, the "Lagstiftningskedja" section is the primary source of document-to-document references. This is more structured than the general "Genvägar" section found on SOU pages.

Both are handled by the same classifier but Lagstiftningskedja links are typically higher quality.

### Process Modeling Decision

For Phase 5.2, each proposition gets its own independent process (not merged with SOUs/directives). Process keys follow format `prop-2025-26-36`. Case-level reconstruction (merging related processes) is deferred to Phase 6.
