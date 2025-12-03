# Phase 5: Implementation Plan

**Created:** 2025-12-02  
**Status:** Phase 5.1 Complete → Phase 5.2 Ready

---

## Milestone: Timeline Agent v2.1 — COMPLETE ✅

**Validated:** 2025-12-03  
**Test Results:** 10 documents (5 directives + 5 SOUs), 100% success rate

### Summary

Timeline Agent v2.1 successfully:
- ✅ Enriches metadata on existing events (upsert instead of skip)
- ✅ Person-based deduplication works for `committee_formed` events
- ✅ No false positives or duplicate explosions
- ✅ Idempotency preserved across re-runs
- ✅ Metadata quality is high and aligns with forensic-citation standard

### Test Results Breakdown

| Metric | Value |
|--------|-------|
| Documents processed | 10 |
| Events extracted | 69 |
| Events inserted | 17 |
| Events updated | 39 |
| Processing time | 3.8s - 67.5s per doc |

### Key Validations Passed

1. **Dir. 2025:97**: 3 `remiss_period_end` events correctly updated with `deadline_kind`, `deadline_index`, `deadline_label`
2. **SOU 2025:103**: 9 `committee_formed` events — 6 updated, 3 inserted — each with unique `person_name`
3. **SOU 2025:51**: 15 `committee_formed` events — multiple experts on same date correctly handled
4. **SOU 2025:52**: 14 committee members + 1 secretary — all with proper metadata

### Known Behavior (Accepted for Now)

- `deadline_index` restarts for different deadline kinds (interim/final)
- This is acceptable and will be revisited in Phase 6 when full sequencing logic is introduced

---

## Implementation Order

### Phase 5.1: Foundation ✅ COMPLETE

#### A. Database Migrations ✅
```sql
-- 1. lifecycle_stage column added to documents
-- 2. document_references table created
-- 3. external_urls JSONB column added to documents
```

#### B. Timeline Agent v2.1 ✅
- Confidence scoring implemented
- New event types working
- Metadata layer (committee_event_kind, deadline_kind, etc.)
- Person-based deduplication for committee_formed
- Metadata upsert on re-runs
- Regression test passed on existing SOUs

#### C. Metadata Agent v2 (pending)
- Add `organization` entity type
- Remove ministry extraction
- Strengthen validation rules

---

### Phase 5.2: Propositions (Ready to Start)

See detailed plan below.

---

### Phase 5.3: Remisser + Remissvar (Week 4-5)

#### A. Remiss Scraper
- Scrape regeringen.se/remisser
- Extract remiss period dates
- Link to parent SOU/proposition

#### B. Remissvar Handling
- Extract stakeholder organizations
- Multiple orgs per remissvar
- Link to parent remiss

#### C. Validation
- 10 sample remisser
- Stakeholder extraction accuracy
- Remiss period events

### Phase 5.4: Committee Reports + Laws (Week 6-7)

#### A. Committee Report Scraper
- Scrape riksdagen.se/betankanden
- Extract committee names
- Link to propositions

#### B. Law Scraper
- Scrape riksdagen.se/lagar
- Extract enactment dates
- Link to source propositions

#### C. Validation
- 5 samples each type
- Cross-document linking
- Timeline continuity

### Phase 5.5: Integration (Week 8)

- End-to-end testing
- Performance benchmarks
- Documentation update
- Phase completion summary

---

## Test Plan Summary

### Per Document Type

| Document Type | Sample Size | Key Validations |
|--------------|-------------|-----------------|
| Propositions | 10 | Timeline events, Genvägar links |
| Remisser | 10 | Period dates, stakeholders |
| Remissvar | 20 | Stakeholder orgs extraction |
| Committee Reports | 5 | Committee names, prop links |
| Laws | 5 | Enactment dates, source links |

### Regression Tests

- [x] Existing SOUs still process correctly
- [x] Timeline Agent v2.1 events not duplicated
- [ ] Entity deduplication works
- [ ] Search includes all doc types
- [ ] Performance < 500ms

### Data Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Citation coverage | 95%+ | source_page + source_excerpt present |
| Entity precision | 98%+ | No placeholder entities |
| Reference accuracy | 90%+ | Correct reference_type classification |
| Confidence calibration | ✅ Validated | High = actual day, Medium = month, Low = year |

---

## Artifact Checklist

- [x] Database migration SQL
- [x] Timeline Agent v2.1 (agent-timeline-v2/index.ts)
- [ ] Metadata Agent v2 (agent-metadata/index.ts updated)
- [ ] Proposition scraper (scrape-proposition-index/index.ts)
- [ ] Genvägar classifier (_shared/genvag-classifier.ts)
- [ ] Head Detective v3 (agent-head-detective/index.ts updated)
- [x] Test documentation (docs/testing/phase-5-test-plan.md)

---

## Ready for Phase 5.2

Next steps:
1. **Review Phase 5.2 plan** (see phase-5-legislative-graph-expansion.md)
2. **Implement Proposition scraper**
3. **Extend Timeline Agent for proposition events**
4. **Extend Metadata Agent for proposition entities**
