# Phase 5.2 Completion Summary: Proposition Slice

**Completed:** 2025-12-09  
**Status:** ✅ COMPLETE

---

## Executive Summary

Phase 5.2 (Proposition Slice) has been successfully completed. The proposition ingestion pipeline is fully operational, processing 100 propositions from regeringen.se with text extraction, timeline events, and metadata entities.

---

## Final Metrics

### Document Coverage

| Metric | Count | Notes |
|--------|-------|-------|
| **Total Propositions** | 100 | Complete dataset for walking skeleton |
| **With Text Extracted** | 98 | 98% coverage |
| **Skipped (Non-PDF)** | 2 | Budget propositions with Excel primary files |
| **PDF Extraction Errors** | 0 | No unexpected failures |

### Process & Agent Coverage

| Metric | Count |
|--------|-------|
| **Propositions with Linked Process** | 96 |
| **Timeline Events** | 213 |
| **Metadata Entities** | 50 |
| **Document References (Lagstiftningskedja)** | 537 |
| **Resolved References** | 11 (2%) |

---

## Pipeline Validation

### Text Extraction ✅

- **Pipeline:** `process-sou-pdf` edge function
- **Final extraction run:** 2025-12-09
- **Documents processed:** 2 (Prop. 2025/26:73 and 2025/26:77)
- **Success rate:** 100%
- **Non-PDF handling:** Budget propositions (Prop. 2025/26:1, 2025/26:2) correctly identified as Excel files and marked `skipped_non_pdf`

### Timeline Agent v2.2 ✅

Successfully extracts:
- `proposition_submitted` events (government submission date)
- `law_enacted` events (proposed law enactment dates)
- `committee_formed` events (minister appointments in proposition context)

**Sample Events:**
| Proposition | Event Type | Date | Confidence |
|-------------|-----------|------|------------|
| Prop. 2024/25:100 | proposition_submitted | 2025-04-10 | high |
| Prop. 2024/25:155 | law_enacted | 2027-01-01 | high |
| Prop. 2024/25:157 | proposition_submitted | 2025-04-10 | high |

### Metadata Agent v2.2 ✅

Successfully extracts:
- Ministers with correct Swedish titles (statsminister, justitieminister, etc.)
- Political office holders from signature blocks
- Proper forensic citations (page + excerpt)

**Fix Applied:** v2.2 corrected minister role classification issue where SOU-style roles ("utredare") were incorrectly applied to propositions.

---

## Known Limitations

### 1. Budget Propositions (Non-PDF)

**Affected:** Prop. 2025/26:1 (Budgetpropositionen), Prop. 2025/26:2 (Höständringsbudget)

**Behavior:** Primary downloadable files are Excel spreadsheets, not PDFs. These are correctly:
- Marked with `pdf_text_status = 'skipped_non_pdf'`
- Have `metadata.primary_file_type = 'excel'`
- Do not have processes/agents run (no text to analyze)

**Future Enhancement:** Phase 6+ could implement Excel parsing for budget data extraction.

### 2. Lagstiftningskedja Link Resolution

**Status:** Extraction working, resolution incomplete

- **537 document references** extracted from Lagstiftningskedja sections
- **Only 11 (2%)** resolved to existing `target_document_id`
- Root cause: `target_doc_number` extraction produces full titles instead of clean document numbers

**Planned Fix:** See `LAGSTIFTNINGSKEDJA_IMPROVEMENT_PLAN.md`

### 3. Scraper 19/20 Pattern

**Behavior:** Proposition scraper occasionally extracts 19/20 items per page instead of 20/20.

**Status:** Non-blocking, documented in `SCRAPER_KNOWN_ISSUES.md`

**Root Cause:** Conservative HTML parsing filters silently skip items that don't match expected patterns.

---

## Pilot Validation Summary

Three pilot propositions were fully validated before batch scaling:

| Proposition | Ministry | Text | Timeline | Entities |
|------------|----------|------|----------|----------|
| Prop. 2025/26:36 | Försvarsdepartementet | ✅ | 2 events | 2 ministers |
| Prop. 2025/26:42 | Finansdepartementet | ✅ | 2 events | 2 ministers |
| Prop. 2025/26:48 | Justitiedepartementet | ✅ | 2 events | 2 ministers |

---

## Files Created/Updated

### New Files
- `supabase/functions/scrape-proposition-index/index.ts` - Proposition scraper
- `src/components/admin/PropositionScraperTest.tsx` - Admin UI for scraper
- `src/components/admin/PropositionTextExtractorTest.tsx` - Admin UI for extraction
- `src/components/admin/PropositionAgentTest.tsx` - Admin UI for agents
- `src/components/admin/PropositionBatchProcessor.tsx` - Batch processing UI

### Updated Files
- `supabase/functions/agent-metadata/index.ts` - v2.2 with proposition support
- `supabase/functions/agent-timeline-v2/index.ts` - v2.2 with proposition events
- `supabase/functions/process-sou-pdf/index.ts` - Non-PDF graceful handling
- `supabase/functions/_shared/pdf-scorer.ts` - Attachment extraction improvements
- `supabase/functions/_shared/genvag-classifier.ts` - Link classification

---

## Validation Queries

### Final Coverage Check
```sql
SELECT
  COUNT(*) FILTER (WHERE doc_type = 'proposition') AS total_props,
  COUNT(*) FILTER (WHERE doc_type = 'proposition' AND raw_content IS NOT NULL) AS with_text,
  COUNT(*) FILTER (WHERE doc_type = 'proposition' AND (metadata->>'pdf_text_status') = 'skipped_non_pdf') AS skipped_non_pdf
FROM documents;
-- Result: 100 total, 98 with text, 2 skipped_non_pdf
```

### Timeline Coverage
```sql
SELECT COUNT(*) FROM timeline_events te
JOIN process_documents pd ON pd.process_id = te.process_id
JOIN documents d ON d.id = pd.document_id
WHERE d.doc_type = 'proposition';
-- Result: 213 events
```

### Entity Coverage
```sql
SELECT COUNT(*) FROM entities e
JOIN documents d ON d.id = e.source_document_id
WHERE d.doc_type = 'proposition';
-- Result: 50 entities
```

---

## Next Phase

**Phase 5.3: Remisser + Remissvar**

Prerequisites complete:
- ✅ Timeline Agent v2.2 validated on propositions
- ✅ Metadata Agent v2.2 validated on propositions
- ✅ Document reference infrastructure in place
- ✅ Non-PDF handling working

See `docs/development/branches/phase-5-legislative-graph-expansion.md` for Phase 5.3 plan.
