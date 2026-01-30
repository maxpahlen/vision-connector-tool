# DB & Pipeline Sanity Audit

**Audit Date:** 2026-01-30  
**Auditor:** Lovable (Architectural Authority)  
**Message Type:** VERIFICATION | Phase: VERIFICATION

---

## Executive Summary

| Metric | Value | Status |
|--------|-------|--------|
| Total Documents | 863 | ✅ |
| Total Entities | 1,760 | ✅ |
| Timeline Events | 1,050 | ✅ |
| Remiss Documents | 54 | ✅ |
| Remissvar Responses | 3,421 | ✅ |
| Document References | 1,083 | ⚠️ Low resolution |
| Duplicate Records | 0 | ✅ |
| Search Indexing | 100% | ✅ |

**Overall Status: ⚠️ HEALTHY with Action Items**

---

## Pipeline-by-Pipeline Verification

### 1. SOU Documents

| Field | Total | Missing | Status |
|-------|-------|---------|--------|
| doc_number | 60 | 0 | ✅ |
| title | 60 | 0 | ✅ |
| url | 60 | 0 | ✅ |
| pdf_url | 60 | 0 | ✅ |
| raw_content | 60 | 0 | ✅ |
| publication_date | 60 | 0 | ✅ |
| lifecycle_stage | 60 | 0 | ✅ |

**Sample Verification (5 records):**
```
SOU 2025:105 - 82,719 chars ✅
SOU 2025:106 - 111,232 chars ✅
SOU 2024:71 - 877,927 chars ✅
SOU 2024:75 - 517,657 chars ✅
SOU 2024:74 - 1,624,708 chars ✅
```

**Status: ✅ VERIFIED - All required fields populated**

---

### 2. Propositions

| Field | Total | Missing | Pct Missing | Status |
|-------|-------|---------|-------------|--------|
| doc_number | 126 | 0 | 0% | ✅ |
| title | 126 | 0 | 0% | ✅ |
| url | 126 | 0 | 0% | ✅ |
| pdf_url | 126 | 0 | 0% | ✅ |
| raw_content | 126 | **116** | **92%** | ❌ |
| publication_date | 126 | 0 | 0% | ✅ |
| lifecycle_stage | 126 | 0 | 0% | ✅ |

**Sample Verification (5 recent records):**
```
Prop. 2024/25:95  - 0 chars (missing) ❌
Prop. 2024/25:107 - 0 chars (missing) ❌
Prop. 2024/25:118 - 0 chars (missing) ❌
Prop. 2024/25:144 - 0 chars (missing) ❌
Prop. 2024/25:125 - 0 chars (missing) ❌
```

**Status: ⚠️ RISK - 92% missing raw_content**

**Root Cause:** Riksdagen API scraper (`scrape-propositions-riksdagen`) ingests metadata but does not fetch text content. The `fetchText` parameter exists but text endpoint returns empty for many propositions.

**Recommended Fix:**
1. Add PDF download capability to proposition scraper
2. Use `process-sou-pdf` pattern for text extraction
3. Backfill 116 missing propositions

---

### 3. Directives

| Field | Total | Missing | Pct Missing | Status |
|-------|-------|---------|-------------|--------|
| doc_number | 183 | 0 | 0% | ✅ |
| title | 183 | 0 | 0% | ✅ |
| url | 183 | 0 | 0% | ✅ |
| raw_content | 183 | **127** | **69%** | ❌ |
| publication_date | 183 | 0 | 0% | ✅ |
| lifecycle_stage | 183 | **56** | 31% | ⚠️ |
| kommittébeteckning | 183 | 178 | 97% | ⚠️ |

**Sample Verification (5 recent records with kommittébeteckning):**
```
Dir. 2020:134 - Ju 2019:02 ✅ (but 0 chars raw_content)
Dir. 2020:135 - I 2020:01 ✅ (but 0 chars raw_content)
Dir. 2020:136 - N 2020:01 ✅ (but 0 chars raw_content)
Dir. 2020:137 - Fi 2020:04 ✅ (but 0 chars raw_content)
Dir. 2020:139 - Ju 2020:03 ✅ (but 0 chars raw_content)
```

**Sample of directives missing lifecycle_stage:**
```
Dir. 2025:13  - NULL lifecycle_stage
Dir. 2025:30  - NULL lifecycle_stage
Dir. 2025:48  - NULL lifecycle_stage
Dir. 2025:10  - NULL lifecycle_stage
Dir. 2025:105 - NULL lifecycle_stage
```

**Status: ⚠️ RISK - Multiple gaps**

**Root Cause:**
1. `raw_content`: Riksdagen text endpoint doesn't return content for directives
2. `lifecycle_stage`: Recent 2025 directives ingested without setting field
3. `kommittébeteckning`: Only found in 2020 session directives (5 of 183)

**Recommended Fix:**
1. Update scraper to set `lifecycle_stage = 'directive'` for all inserts
2. Run migration to backfill lifecycle_stage for 56 null records
3. kommittébeteckning is legitimately sparse for new directives (assigned later)

---

### 4. Committee Reports

| Field | Total | Missing | Pct Missing | Status |
|-------|-------|---------|-------------|--------|
| doc_number | 333 | 0 | 0% | ✅ |
| title | 333 | 0 | 0% | ✅ |
| url | 333 | 0 | 0% | ✅ |
| raw_content | 333 | **1** | **0.3%** | ⚠️ |
| publication_date | 333 | 0 | 0% | ✅ |
| lifecycle_stage | 333 | 0 | 0% | ✅ |

**Missing record identified:**
```
HC01FiU1 - "Statens budget 2025 – Rambeslutet"
URL: https://www.riksdagen.se/sv/dokument-och-lagar/dokument/HC01FiU1/
PDF: https://data.riksdagen.se/fil/D89EEB2D-7961-4D1A-BA8E-ABFCACDE9667
```

**Status: ⚠️ MINOR - 1 document needs re-extraction**

**Recommended Fix:** Re-run PDF extraction for HC01FiU1

---

### 5. Laws (SFS)

| Field | Total | Missing | Status |
|-------|-------|---------|--------|
| doc_number | 161 | 0 | ✅ |
| title | 161 | 0 | ✅ |
| url | 161 | 0 | ✅ |
| raw_content | 161 | 0 | ✅ |
| publication_date | 161 | 0 | ✅ |
| lifecycle_stage | 161 | 0 | ✅ |

**Sample Verification (5 records):**
```
2024:11  - 1,750 chars ✅
2024:14  - 3,721 chars ✅
2024:7   - 10,704 chars ✅
2024:30  - 5,788 chars ✅
2024:31  - 639 chars ✅
```

**Status: ✅ VERIFIED - All required fields populated**

---

### 6. Remiss Documents

| Field | Total | Missing | Status |
|-------|-------|---------|--------|
| remiss_page_url | 54 | 0 | ✅ |
| title | 54 | 0 | ✅ |
| remiss_deadline | 54 | 40 | ⚠️ |
| status | 54 | 0 | ✅ |

**Status Distribution:**
- `scraped`: 54 (100%)

**Status: ⚠️ ACCEPTABLE - Deadline often not published**

**Note:** 40/54 missing deadlines is expected - not all remisser publish deadline on page.

---

### 7. Remissvar Responses

| Field | Total | Count | Pct | Status |
|-------|-------|-------|-----|--------|
| file_url | 3,421 | 3,421 | 100% | ✅ |
| responding_organization | 3,421 | 3,421 | 100% | ✅ |
| entity_id (linked) | 3,421 | 3,421 | 100% | ✅ |
| extraction_status=ok | 3,421 | 3,366 | 98.4% | ✅ |
| extraction_status=error | 3,421 | 55 | 1.6% | ⚠️ |
| raw_content present | 3,421 | 3,366 | 98.4% | ✅ |
| analysis_status=ok | 3,421 | 2,192 | 64% | ✅ |

**Extraction Error Sample (5 records):**
```
panoptes-sweden-ab.pdf - parse_failed (scanned PDF)
sametinget.pdf - parse_failed (scanned PDF)
forsvarets-materielverk.pdf - parse_failed (scanned PDF)
angermanlands-tingsratt.pdf - parse_failed (scanned PDF)
malung-salens-kommun.pdf - parse_failed (scanned PDF)
```

**Status: ✅ VERIFIED - 55 errors are scanned PDFs (known limitation)**

---

### 8. Entities

| Type | Total | Missing name | Missing name_lower | No source_doc |
|------|-------|--------------|-------------------|---------------|
| organization | 1,473 | 0 | 0 | 1,473 | 
| person | 168 | 0 | 0 | 0 |
| committee | 119 | 0 | 0 | 0 |

**Status: ⚠️ NOTE - Organizations have no source_document_id**

**Note:** This is by design - organizations are bootstrapped from remiss invitee lists, not extracted from documents. `source_document_id = NULL` is expected for organizations.

---

### 9. Timeline Events

| Event Type | Total | Missing process | Missing date | Missing description |
|------------|-------|-----------------|--------------|---------------------|
| committee_formed | 453 | 0 | 0 | 0 |
| parliament_decision | 327 | 0 | 0 | 0 |
| directive_issued | 138 | 0 | 0 | 0 |
| remiss_period_end | 73 | 0 | 0 | 0 |
| sou_published | 40 | 0 | 0 | 0 |
| proposition_submitted | 10 | 0 | 0 | 0 |
| law_enacted | 9 | 0 | 0 | 0 |

**Total: 1,050 events**

**Sample Verification (5 records):**
```
2024-09-25 parliament_decision: bet-HC01NU5 ✅
2024-09-25 parliament_decision: bet-HC01MJU3 ✅
2024-09-25 parliament_decision: bet-HC01JuU2 ✅
2024-09-25 parliament_decision: bet-HC01FiU14 ✅
2024-10-02 parliament_decision: bet-HC01SfU7 ✅
```

**Status: ✅ VERIFIED - All required fields populated**

---

### 10. Document References (Cross-Links)

| Reference Type | Total | Resolved | Unresolved |
|----------------|-------|----------|------------|
| cites | 541 | 77 | 464 |
| recommends | 232 | 0 | 232 |
| references | 134 | 0 | 134 |
| has_committee_report | 122 | 0 | 122 |
| related | 38 | 2 | 36 |
| amends | 11 | 0 | 11 |
| fulfills | 5 | 5 | 0 |

**Overall Resolution:**
- Total: 1,083 references
- Resolved: 84 (7.8%)
- Unresolved with target_doc_number: 999

**Status: ⚠️ RISK - Very low resolution rate**

**Root Cause:** References cite documents not yet in database (SOUs, propositions from other years, external EU regulations, etc.)

**Recommended Fix:** 
1. Expand document corpus to include more historical SOUs/propositions
2. Run `resolve-document-references` edge function after new ingestion batches

---

### 11. Remiss Invitees

| Metric | Value | Status |
|--------|-------|--------|
| Total | 4,321 | ✅ |
| Missing org_name | 0 | ✅ |
| Linked to entity | 4,321 | ✅ |
| Link rate | 100% | ✅ |

**Status: ✅ VERIFIED - All invitees linked**

---

### 12. Process-Document Links

| Role | Total | Missing process | Missing document |
|------|-------|-----------------|------------------|
| main_sou | 57 | 0 | 0 |
| directive | 56 | 0 | 0 |
| proposition | 10 | 0 | 0 |
| sou | 3 | 0 | 0 |

**Status: ✅ VERIFIED - All links valid**

---

### 13. Processes

| Metric | Total | Count | Status |
|--------|-------|-------|--------|
| Total | 454 | - | ✅ |
| Missing process_key | 454 | 0 | ✅ |
| Missing title | 454 | 0 | ✅ |
| Missing current_stage | 454 | 0 | ✅ |
| No main_document_id | 454 | 114 | ⚠️ |
| Has directive_number | 454 | 56 | ✅ |

**Status: ⚠️ ACCEPTABLE - 114 processes without main_document**

**Note:** Some processes (especially committee report-based ones) don't have a single "main" document. This is expected.

---

### 14. Search Indexing

| Doc Type | Total | Indexed | Rate |
|----------|-------|---------|------|
| committee_report | 333 | 333 | 100% |
| directive | 183 | 183 | 100% |
| law | 161 | 161 | 100% |
| proposition | 126 | 126 | 100% |
| sou | 60 | 60 | 100% |

**Status: ✅ VERIFIED - All documents indexed**

---

### 15. Agent Tasks (Queue Health)

| Agent | Task Type | Status | Count |
|-------|-----------|--------|-------|
| agent-metadata | metadata_extraction | completed | 127 |
| pdf_processor | process_pdf | completed | 116 |
| document_fetcher | fetch_regeringen_document | completed | 114 |
| agent-timeline-v2 | timeline_extraction | completed | 108 |

**Pending/Stuck Tasks: 0**

**Status: ✅ VERIFIED - No stuck tasks**

---

## Data Integrity Checks

### Duplicate Records
```sql
SELECT doc_type, doc_number, COUNT(*) 
FROM documents GROUP BY doc_type, doc_number HAVING COUNT(*) > 1
```
**Result: 0 duplicates** ✅

### Orphaned References
All document_references have valid source_document_id ✅

### Entity Uniqueness
Unique constraint on `LOWER(name)` for organizations ✅

---

## Summary of Action Items

### ❌ Critical (Fix Required)

| Issue | Table | Count | Fix |
|-------|-------|-------|-----|
| Missing raw_content | propositions | 116/126 | Add PDF extraction to proposition pipeline |
| Missing raw_content | directives | 127/183 | Add PDF/text extraction capability |

### ⚠️ Moderate (Should Fix)

| Issue | Table | Count | Fix |
|-------|-------|-------|-----|
| Missing lifecycle_stage | directives | 56 | Run backfill migration |
| Missing raw_content | committee_report | 1 | Re-extract HC01FiU1 |
| Low reference resolution | document_references | 92% unresolved | Expand corpus + re-run resolver |

### ℹ️ Informational (No Action)

| Issue | Table | Count | Reason |
|-------|-------|-------|--------|
| Extraction errors | remiss_responses | 55 | Scanned PDFs - OCR out of scope |
| No source_document_id | entities (org) | 1,473 | By design - bootstrapped from invitees |
| Missing remiss_deadline | remiss_documents | 40 | Not published on source pages |
| No main_document_id | processes | 114 | Committee report processes - acceptable |

---

## SQL Queries Used

```sql
-- Pipeline completeness per doc_type
SELECT doc_type, COUNT(*), 
  COUNT(*) FILTER (WHERE raw_content IS NULL) as missing_content
FROM documents GROUP BY doc_type;

-- Remissvar extraction status
SELECT extraction_status, COUNT(*) FROM remiss_responses GROUP BY extraction_status;

-- Entity linking rate
SELECT COUNT(*) FILTER (WHERE entity_id IS NOT NULL) * 100.0 / COUNT(*) 
FROM remiss_responses;

-- Reference resolution rate
SELECT COUNT(*) FILTER (WHERE target_document_id IS NOT NULL) * 100.0 / COUNT(*)
FROM document_references;

-- Duplicate check
SELECT doc_type, doc_number, COUNT(*) FROM documents 
GROUP BY doc_type, doc_number HAVING COUNT(*) > 1;

-- Stuck tasks check
SELECT status, COUNT(*) FROM agent_tasks 
WHERE status IN ('pending', 'in_progress') GROUP BY status;
```

---

## Verification Sign-Off

| Check | Status | Verified By |
|-------|--------|-------------|
| All pipelines audited | ✅ | Lovable |
| Sample records verified | ✅ | 5 per pipeline |
| Integrity constraints checked | ✅ | 0 duplicates |
| Queue health verified | ✅ | 0 stuck tasks |
| Search indexing verified | ✅ | 100% coverage |

**Audit Complete: 2026-01-30**

---

## Next Steps for Max/Codex

1. **P0:** Review proposition/directive raw_content gaps - decide if PDF extraction is worth implementing
2. **P1:** Run migration to backfill 56 directive lifecycle_stage values
3. **P1:** Re-extract single committee report (HC01FiU1)
4. **P2:** After expanding document corpus, re-run reference resolver
