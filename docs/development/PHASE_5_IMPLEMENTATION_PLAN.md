# Phase 5: Implementation Plan

**Created:** 2025-12-02  
**Status:** Ready for Implementation

---

## Implementation Order

### Phase 5.1: Foundation (Week 1)

#### A. Database Migrations
```sql
-- 1. Add lifecycle_stage to documents
ALTER TABLE documents
ADD COLUMN lifecycle_stage TEXT
CHECK (lifecycle_stage IN (
  'directive',
  'interim_analysis',
  'remiss',
  'proposition',
  'parliament',
  'law'
));

-- 2. Create document_references table
CREATE TABLE document_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  target_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  target_doc_number TEXT,
  reference_type TEXT NOT NULL,
  source_page INTEGER,
  source_excerpt TEXT,
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_doc_refs_source ON document_references(source_document_id);
CREATE INDEX idx_doc_refs_target ON document_references(target_document_id);
CREATE INDEX idx_doc_refs_target_number ON document_references(target_doc_number);

ALTER TABLE document_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read document_references"
ON document_references FOR SELECT
USING (true);

-- 3. Add external_urls JSONB to documents
ALTER TABLE documents
ADD COLUMN external_urls JSONB DEFAULT '[]'::jsonb;
```

#### B. Timeline Agent v2
- Add confidence scoring
- Add new event types
- Regression test on existing SOUs

#### C. Metadata Agent v2
- Add `organization` entity type
- Remove ministry extraction
- Strengthen validation rules

### Phase 5.2: Propositions (Week 2-3)

#### A. Proposition Scraper
- Scrape regeringen.se/propositioner
- Extract title, doc_number, PDF URL
- Set `doc_type = 'proposition'`
- Set `lifecycle_stage = 'proposition'`

#### B. Genvägar Classifier
- Parse Genvägar section
- Classify reference types
- Create document_references
- Store external URLs

#### C. Head Detective v3
- Handle proposition documents
- Orchestrate Timeline + Metadata agents
- Process Genvägar links

#### D. Validation
- 10 sample propositions
- Timeline events with confidence
- Document references created

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

- [ ] Existing SOUs still process correctly
- [ ] Timeline Agent v1 events not duplicated
- [ ] Entity deduplication works
- [ ] Search includes all doc types
- [ ] Performance < 500ms

### Data Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Citation coverage | 95%+ | source_page + source_excerpt present |
| Entity precision | 98%+ | No placeholder entities |
| Reference accuracy | 90%+ | Correct reference_type classification |
| Confidence calibration | TBD | High = actual day, Medium = month, Low = year |

---

## Artifact Checklist

- [ ] Database migration SQL
- [ ] Timeline Agent v2 (agent-timeline-v2/index.ts)
- [ ] Metadata Agent v2 (agent-metadata/index.ts updated)
- [ ] Proposition scraper (scrape-proposition-index/index.ts)
- [ ] Genvägar classifier (_shared/genvag-classifier.ts)
- [ ] Head Detective v3 (agent-head-detective/index.ts updated)
- [ ] Test documentation (docs/testing/phase-5-test-plan.md)

---

## Ready for Implementation

When approved, proceed with:

1. **Run database migrations** (requires user approval)
2. **Deploy Timeline Agent v2**
3. **Regression test** on existing data
4. **Then** start proposition slice
