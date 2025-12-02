# Phase 5: Legislative Graph Expansion

**Status:** 🚀 In Progress  
**Branch:** `phase-5-legislative-graph`  
**Dependencies:** Phase 3 (Multi-Agent AI), Phase 4 (Search & Discovery)

---

## Core Strategy

> **One new document type at a time → fully end-to-end → tested → then move to the next.**

Each document type must be integrated *completely*, meaning:
1. It is scraped / ingested
2. Metadata Agent extracts entities and relations from it
3. Timeline Agent extracts relevant events with citations
4. Search/discovery features consume it correctly

Only after a document type is stable do we move on to the next one.

---

## Implementation Order

Following the Swedish legislative lifecycle:

| Order | Document Type | Source | Key Entities |
|-------|--------------|--------|--------------|
| 1️⃣ | **Propositions** | regeringen.se/propositioner | Ministers, Referenced SOUs |
| 2️⃣ | **Remisser + Remissvar** | regeringen.se/remisser | Stakeholder organizations |
| 3️⃣ | **Committee Reports** | riksdagen.se | Committee names |
| 4️⃣ | **Laws** | riksdagen.se | Referenced legislation |

---

## Goal

Expand beyond SOUs and Directives to build comprehensive legislative process graph, following the walking skeleton approach.

**Key Principle:** New document types are **optional enrichments** that extend the walking skeleton, not blockers.

---

## Scope

### In Scope

#### 1. New Document Types (in order)
- **Propositions** (regeringens propositioner) — FIRST
- **Remisser** (consultation documents) — SECOND
- **Remissvar** (consultation responses) — SECOND
- **Committee Reports** (utskottsbetänkanden) — THIRD
- **Laws** (lagar och förordningar) — FOURTH

#### 2. Timeline Agent v2 Enhancements
- **Future date extraction with confidence scoring:**

| Example text | Expected event | Confidence |
|-------------|----------------|------------|
| "Beslut vid regeringssammanträde den 30 november 2025" | government_decision_scheduled | high |
| "Planerat överlämnande i juni 2026" | delivery_planned | medium |
| "Målet är att lämna proposition under 2027" | proposition_submitted | low |

- **New event types:**
  - `directive_issued`
  - `committee_formed`
  - `remiss_period_start` / `remiss_period_end`
  - `proposition_submitted`
  - `law_enacted`

#### 3. Document-to-Document References via Genvägar
- Scrape "Genvägar" links from regeringen.se
- Model as **document-to-document references** (not generic URLs):
  ```text
  SOU → Proposition → Betänkande → Lag
  SOU → Remiss → Remissvar
  ```
- Classify link types based on anchor text and URL patterns
- Store unresolved references for future linking

#### 4. Metadata Agent v2 Enhancements
- **NEW entity type:** External stakeholders (organizations submitting remissvar)
- **KEEP:** Committee names
- **DO NOT extract:** Ministries (use `documents.ministry` instead)
- **DO NOT extract:** Placeholder entities without real names

### Out of Scope (Phase 6+)

- ❌ Document-to-document relationship **inference** (Phase 6)
- ❌ Case-level reconstruction (Phase 6)
- ❌ Entity influence mapping (Phase 7)
- ❌ Predictive analytics (Phase 7)
- ❌ Timeline visualization (UI improvement)
- ❌ UX improvements (Phase 4.4+)
- ❌ New entity types beyond stakeholders (postponed)

---

## Success Criteria

Phase 5 is complete when:

- [ ] Propositions have end-to-end ingestion and appear in search
- [ ] Remisser + Remissvar have end-to-end ingestion
- [ ] Committee Reports have end-to-end ingestion
- [ ] Laws have end-to-end ingestion
- [ ] Timeline Agent v2 extracts event types with confidence scores
- [ ] Metadata Agent v2 extracts stakeholders without hallucinations
- [ ] Genvägar links produce document-to-document references
- [ ] `lifecycle_stage` is populated and consistent
- [ ] No regressions to Phase 3 or Phase 4 functionality

---

## Database Schema Changes

### 1. Add `lifecycle_stage` to documents

```sql
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
```

### 2. Document-to-Document References

```sql
CREATE TABLE document_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  target_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  target_doc_number TEXT,  -- e.g., "Dir. 2024:122" (for unresolved refs)
  reference_type TEXT NOT NULL,  -- 'cites', 'amends', 'responds_to', 'based_on', 'related'
  source_page INTEGER,
  source_excerpt TEXT,
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_doc_refs_source ON document_references(source_document_id);
CREATE INDEX idx_doc_refs_target ON document_references(target_document_id);
CREATE INDEX idx_doc_refs_target_number ON document_references(target_doc_number);

-- Enable RLS
ALTER TABLE document_references ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read document_references"
ON document_references FOR SELECT
USING (true);
```

### 3. External URLs (JSONB on documents)

```sql
ALTER TABLE documents
ADD COLUMN external_urls JSONB DEFAULT '[]'::jsonb;

-- Example structure:
-- [
--   {"url": "https://...", "type": "press_release", "title": "...", "scraped_at": "..."},
--   {"url": "https://...", "type": "genvag", "anchor_text": "..."}
-- ]
```

---

## Timeline Agent v2 Requirements

### New Event Types

| Event Type | Description | Document Types |
|------------|-------------|----------------|
| `sou_published` | SOU handed over to government | SOU |
| `directive_issued` | Directive issued by government | Directive |
| `committee_formed` | Committee established | SOU, Directive |
| `remiss_period_start` | Consultation period begins | Remiss |
| `remiss_period_end` | Consultation deadline | Remiss |
| `proposition_submitted` | Proposition submitted to parliament | Proposition |
| `law_enacted` | Law comes into force | Law |

### Confidence Scoring Rules

Confidence based **only** on linguistic evidence:

- **high**: Exact date with day specified (e.g., "den 30 november 2025")
- **medium**: Month + year specified (e.g., "i juni 2026")
- **low**: Year only or vague timing (e.g., "under 2027", "våren 2028")

### Tool Schema v2

```typescript
{
  name: "report_timeline_event",
  parameters: {
    event_type: {
      type: "string",
      enum: [
        "sou_published",
        "directive_issued",
        "committee_formed",
        "remiss_period_start",
        "remiss_period_end",
        "proposition_submitted",
        "law_enacted"
      ]
    },
    event_date: {
      type: "string",
      description: "ISO format YYYY-MM-DD (use -01 for month-only dates)"
    },
    confidence: {
      type: "string",
      enum: ["high", "medium", "low"],
      description: "Based on linguistic precision of date mention"
    },
    description: { type: "string" },
    source_excerpt: { type: "string" },
    source_page: { type: "number" },
    actors: {
      type: "array",
      items: { name: string, role: string }
    }
  }
}
```

---

## Metadata Agent v2 Requirements

### Entity Type Scope

| Entity Type | Action | Notes |
|-------------|--------|-------|
| `person` | ✅ KEEP | Lead investigators only |
| `committee` | ✅ KEEP | Committee names |
| `organization` | ✅ ADD | External stakeholders (remissvar) |
| `ministry` | ❌ REMOVE | Use `documents.ministry` instead |

### Validation Rules

- **Person names:** MUST contain first name + surname
- **Organizations:** MUST be real org names (e.g., "Sveriges Kommuner och Regioner")
- **No placeholders:** Reject "Särskild utredare", "Samordnaren", etc.
- **Multiple orgs:** If remissvar has multiple signatories, extract each separately

---

## Genvägar Link Classification

### Reference Type Mapping

| URL Pattern / Anchor Text | Reference Type |
|---------------------------|----------------|
| `/propositioner/` | `based_on` |
| `/kommittedirektiv/` | `cites` |
| `/statens-offentliga-utredningar/` | `cites` |
| `/remisser/` | `related` |
| "ändringar", "ändring" | `amends` |
| "remiss", "svar" | `responds_to` |
| "relaterade", "relaterat" | `related` |
| Press release URLs | Store in `external_urls` |

### Crawler Logic

```
1. Fetch document page on regeringen.se
2. Find "Genvägar" section
3. For each link:
   a. Classify reference_type from anchor text + URL
   b. Try to resolve target_doc_number from URL
   c. Look up target_document_id in database
   d. If found: create document_reference with target_document_id
   e. If not found: create document_reference with target_doc_number only
4. Store press releases in external_urls JSONB
```

---

## Proposition Slice (First Implementation)

### Scraper: `scrape-proposition-index`

**Source:** https://www.regeringen.se/propositioner/

**Steps:**
1. Scrape proposition listing pages
2. Extract: title, doc_number (e.g., "Prop. 2024/25:123"), URL, PDF URL
3. Set `doc_type = 'proposition'`
4. Set `lifecycle_stage = 'proposition'`
5. Scrape Genvägar for related documents

### Head Detective v3 Updates

- Handle `doc_type = 'proposition'`
- Dispatch Timeline Agent v2 for `proposition_submitted` events
- Dispatch Metadata Agent v2 for entity extraction
- Handle Genvägar link processing

---

## Testing Strategy

### Per Document Type

For each new document type:
- [ ] 5-10 sample documents ingested
- [ ] Timeline events extracted with citations
- [ ] Entities extracted without hallucinations
- [ ] Genvägar links classified correctly
- [ ] Documents searchable in UI
- [ ] No duplicates created

### Timeline Agent v2 Validation

- [ ] Future dates extracted: "Beslut vid regeringssammanträde den [date]"
- [ ] Confidence scores accurate: high/medium/low
- [ ] New event types have citations
- [ ] No regression on `sou_published` extraction

### Genvägar Validation

- [ ] Document references created for known targets
- [ ] Unresolved references stored with doc_number
- [ ] Reference types correctly classified
- [ ] External URLs stored in JSONB

### Data Quality Checks

- [ ] Citation coverage remains 95%+
- [ ] No placeholder entities created
- [ ] Entity deduplication still working
- [ ] lifecycle_stage populated for all new docs

---

## Implementation Phases

### Phase 5.1: Database Schema + Timeline Agent v2
- [ ] Run database migrations
- [ ] Deploy Timeline Agent v2 with confidence scoring
- [ ] Test on existing SOUs (regression test)

### Phase 5.2: Propositions End-to-End
- [ ] Proposition scraper
- [ ] Genvägar link classifier
- [ ] Head Detective v3 updates
- [ ] Validation on 10 sample propositions

### Phase 5.3: Remisser + Remissvar
- [ ] Remiss scraper
- [ ] Remissvar scraper
- [ ] Metadata Agent v2 for stakeholder extraction
- [ ] Validation on 10 sample remisser

### Phase 5.4: Committee Reports + Laws
- [ ] Committee report scraper (riksdagen.se)
- [ ] Law scraper (riksdagen.se)
- [ ] Validation on 5 samples each

### Phase 5.5: Integration & Polish
- [ ] End-to-end test all document types
- [ ] Performance validation
- [ ] Documentation update

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scraper blocked by regeringen.se | No new docs | Rate limiting, user-agent rotation |
| Timeline Agent v2 hallucinations | Bad future dates | Strict confidence scoring, validation rules |
| Genvägar structure changes | Broken link extraction | Defensive parsing, fallback to external_urls |
| Database growth | Slow queries | Indexes, monitor performance |
| Riksdagen.se API changes | Scraper failures | Abstract scraper interface, fallback HTML |

---

## Related Documentation

- [Phase 3: Multi-Agent AI](./phase-3-multi-agent-ai.md)
- [Phase 4: Search & Discovery](./phase-4-search-and-discovery.md)
- [Phase 6: Relationship Inference](./phase-6-relationship-inference.md)
- [Product Roadmap](../PRODUCT_ROADMAP.md)
