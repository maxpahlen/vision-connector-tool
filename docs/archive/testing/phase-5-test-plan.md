# Phase 5 Test Plan

**Created:** 2025-12-02  
**Status:** Ready for Execution

---

## Overview

Phase 5 testing follows the walking skeleton approach: validate each document type end-to-end before moving to the next.

---

## Test Categories

### 1. Database Schema Validation

| Test | Expected Result | Status |
|------|-----------------|--------|
| `lifecycle_stage` column exists on documents | CHECK constraint allows: directive, interim_analysis, remiss, proposition, parliament, law | ⬜ |
| `document_references` table created | Has source_document_id, target_document_id, target_doc_number, reference_type, confidence | ⬜ |
| `external_urls` JSONB column on documents | Defaults to `[]::jsonb` | ⬜ |
| RLS on document_references | Authenticated read access | ⬜ |
| Indexes created | idx_doc_refs_source, idx_doc_refs_target, idx_doc_refs_target_number | ⬜ |

### 2. Timeline Agent v2 Regression Tests

Run on existing SOUs to ensure no regression.

| Test Document | Expected Event | Expected Confidence | Status |
|--------------|----------------|---------------------|--------|
| SOU 2025:32 | sou_published | high or medium | ⬜ |
| SOU 2024:87 | sou_published | high or medium | ⬜ |
| SOU 2024:45 | sou_published | high or medium | ⬜ |

**Validation Criteria:**
- [ ] Same events extracted as v1
- [ ] Confidence scores present
- [ ] No duplicate events created
- [ ] Citations intact (source_page, source_excerpt)

### 3. Timeline Agent v2 New Event Types

| Test Case | Input Text | Expected Event Type | Expected Confidence |
|-----------|-----------|---------------------|---------------------|
| Exact date | "Beslut vid regeringssammanträde den 30 november 2025" | directive_issued or proposition_submitted | high |
| Month+year | "Planerat överlämnande i juni 2026" | sou_published or delivery_planned | medium |
| Year only | "Målet är att lämna proposition under 2027" | proposition_submitted | low |
| Remiss deadline | "Remissvar ska ha kommit in senast den 15 januari 2026" | remiss_period_end | high |

### 4. Proposition Scraper Validation

Run on 10 sample propositions.

| Metric | Target | Measurement |
|--------|--------|-------------|
| Propositions found | ≥ 10 | Count from API response |
| doc_number extracted | 100% | Format: "Prop. YYYY/YY:NNN" |
| PDF URL extracted | ≥ 80% | Check pdf_url not null |
| No duplicates | 0 | Check for existing before insert |
| lifecycle_stage set | 100% | Must be 'proposition' |

**Sample Propositions:**
1. Prop. 2024/25:1 (budget)
2. Prop. 2024/25:50 (typical)
3. Prop. 2023/24:100 (from previous session)
4. Prop. 2024/25:25 (recent)
5. Prop. 2024/25:75 (recent)

### 5. Genvägar Classifier Validation

| Link Type | Sample URL | Expected Reference Type | Expected Confidence |
|-----------|-----------|------------------------|---------------------|
| SOU link | `/sou-2024-87` | cites | high |
| Directive link | `/dir-2024-122` | cites | high |
| Proposition link | `/prop-2024-25-123` | based_on | high |
| Amendment anchor | "ändringar i lagen" | amends | high |
| Related anchor | "Relaterade dokument" | related | medium |
| Press release | `/pressmeddelanden/...` | N/A (external) | low |

### 6. Document Reference Creation

| Test Case | Source Doc | Target Pattern | Expected Result |
|-----------|-----------|----------------|-----------------|
| Known target | Prop. 2024/25:50 | Links to SOU 2024:30 | document_reference with target_document_id |
| Unknown target | Prop. 2024/25:50 | Links to Dir. 2023:99 (not in DB) | document_reference with target_doc_number only |
| Press release | Any | Press release URL | external_urls JSONB entry |

### 7. Metadata Agent v2 Validation

#### Regression (existing functionality)

| Test | Expected Result | Status |
|------|-----------------|--------|
| Lead investigator extraction | Name + role with citation | ⬜ |
| Committee name extraction | Full name with citation | ⬜ |
| No placeholder entities | Rejects "Särskild utredare" alone | ⬜ |
| Entity deduplication | Same entity not created twice | ⬜ |

#### New Functionality (stakeholder extraction)

Run on 5 sample remissvar.

| Metric | Target | Measurement |
|--------|--------|-------------|
| Organizations extracted | ≥ 1 per remissvar | Count entity_type='organization' |
| Multiple orgs per doc | Handles correctly | Check remissvar with 2+ signatories |
| No ministry extraction | 0 | No entity_type='ministry' created |
| Citation coverage | 95%+ | source_page + source_excerpt present |

### 8. End-to-End Integration Tests

#### Test Flow: Search → Document → Process → Entity

| Step | Action | Validation |
|------|--------|------------|
| 1 | Search for "proposition" | Returns proposition documents |
| 2 | Click proposition result | Document detail page loads |
| 3 | View related documents | Shows linked SOUs/directives |
| 4 | Navigate to process | Process page shows proposition |
| 5 | View entities | Shows extracted entities |
| 6 | Click entity | Entity page shows documents |

#### Test Flow: New document ingestion

| Step | Action | Validation |
|------|--------|------------|
| 1 | Scrape new proposition | Document created with lifecycle_stage |
| 2 | Process PDF (if available) | raw_content populated |
| 3 | Run Timeline Agent v2 | Events with confidence created |
| 4 | Run Metadata Agent v2 | Entities and relations created |
| 5 | Process Genvägar | document_references created |
| 6 | Search for document | Appears in search results |

### 9. Performance Tests

| Operation | Target | Measurement Method |
|-----------|--------|-------------------|
| Timeline Agent v2 | < 5s per doc | Log processing_time_ms |
| Metadata Agent v2 | < 5s per doc | Log processing_time_ms |
| Proposition scraper | < 1s per doc | Log timing |
| Search (all doc types) | < 500ms | Network request timing |
| Document detail page | < 500ms | Network request timing |

### 10. Data Quality Metrics

Track these metrics across all Phase 5 document types:

| Metric | Target | SQL Query |
|--------|--------|-----------|
| Citation coverage (timeline) | 95%+ | `SELECT COUNT(*) FILTER (WHERE source_excerpt IS NOT NULL) / COUNT(*)::float FROM timeline_events` |
| Citation coverage (entities) | 95%+ | `SELECT COUNT(*) FILTER (WHERE source_excerpt IS NOT NULL) / COUNT(*)::float FROM entities` |
| Confidence distribution | Documented | `SELECT confidence, COUNT(*) FROM timeline_events GROUP BY confidence` |
| Reference type distribution | Documented | `SELECT reference_type, COUNT(*) FROM document_references GROUP BY reference_type` |
| Placeholder entities | 0 | `SELECT COUNT(*) FROM entities WHERE name IN ('Särskild utredare', 'Samordnaren', ...)` |

---

## Test Execution Checklist

### Phase 5.1: Foundation

- [ ] Database migration applied
- [ ] Schema validation tests pass
- [ ] Timeline Agent v2 deployed
- [ ] Timeline Agent v2 regression tests pass
- [ ] Timeline Agent v2 new event type tests pass

### Phase 5.2: Propositions

- [ ] Proposition scraper deployed
- [ ] 10 sample propositions scraped
- [ ] PDF URLs extracted
- [ ] Timeline events created
- [ ] Genvägar links classified
- [ ] Document references created
- [ ] Search includes propositions

### Phase 5.3: Remisser + Remissvar

- [ ] Remiss scraper deployed
- [ ] 10 sample remisser scraped
- [ ] Metadata Agent v2 deployed
- [ ] Stakeholder organizations extracted
- [ ] Remiss period events created
- [ ] No ministry entities created

### Phase 5.4: Committee Reports + Laws

- [ ] Committee report scraper deployed
- [ ] 5 sample reports scraped
- [ ] Law scraper deployed
- [ ] 5 sample laws scraped
- [ ] law_enacted events created

### Phase 5.5: Integration

- [ ] End-to-end flow tests pass
- [ ] Performance tests pass
- [ ] Data quality metrics documented
- [ ] No Phase 4 regressions
- [ ] Documentation updated

---

## Known Issues & Mitigations

| Issue | Impact | Mitigation |
|-------|--------|------------|
| Regeringen.se rate limiting | Scraper blocked | 500ms delay between requests |
| PDF URLs not always available | No raw_content | Store without PDF, process later |
| Genvägar section structure varies | Missed links | Multiple parsing patterns |
| Confidence scoring subjectivity | Inconsistent scores | Clear linguistic rules in prompt |

---

## Test Data Samples

### Golden Propositions (for validation)

1. **Prop. 2024/25:1** - Budget proposition (complex, many links)
2. **Prop. 2024/25:50** - Typical legislation proposition
3. **Prop. 2023/24:99** - Previous session (tests year handling)

### Golden Remisser (for validation)

1. Remiss with single stakeholder response
2. Remiss with multiple stakeholder responses
3. Remiss with clear deadline date

### Expected Reference Chains

```
Dir. 2023:99 → SOU 2024:45 → Prop. 2024/25:50 → Lag (SFS 2025:xxx)
```

Test that each link is captured as document_reference with correct reference_type.
