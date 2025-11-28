# Phase 5: Legislative Graph Expansion

**Status:** Planned (not started)  
**Branch:** `phase-5-legislative-graph`  
**Dependencies:** Phase 3 (Multi-Agent AI), Phase 4 (Search & Discovery)

---

## Goal

Expand beyond SOUs and Directives to ingest the full spectrum of Swedish legislative documents, building a comprehensive graph of legislative processes from directive to enacted law.

**Key Principle:** New document types are **optional enrichments** that extend the walking skeleton, not blockers.

---

## Scope

### In Scope

#### 1. New Document Types
- **Propositions** (regeringens propositioner)
- **Remisser** (consultation documents)
- **Remissvar** (consultation responses)
- **Motioner** (parliamentary motions)
- **Committee Reports** (utskottsbetänkanden)
- **Laws** (lagar och förordningar)

#### 2. Timeline Agent v2 Enhancements
- **Future date extraction:**
  - "Beslut vid regeringssammanträde den 30 november 2025"
  - "Planerat överlämningsdatum i juni 2026"
  - "Remissperiod till och med [date]"
- **New event types:**
  - `directive_issued`
  - `committee_formed`
  - `remiss_period_start` / `remiss_period_end`
  - `proposition_submitted`
  - `law_enacted`
  - `government_decision_scheduled`
  - `delivery_planned`

#### 3. External Reference Scraping
- **"Genvägar" links from regeringen.se:**
  - Press releases
  - Related directives
  - Related reports
  - Amendments
  - Document bundles
- **Purpose:** Enrich cross-document linking for Phase 6

#### 4. Metadata Agent v2 Enhancements
- **Additional entity types:**
  - External stakeholders (who submitted remissvar)
  - Referenced legislation
  - Impact sectors
  - Budget information

### Out of Scope

- ❌ Document-to-document relationship **inference** (Phase 6)
- ❌ Case-level reconstruction (Phase 6)
- ❌ Entity influence mapping (Phase 7)
- ❌ Predictive analytics (Phase 7)
- ❌ User-facing features beyond existing search (Phase 4 scope)

---

## Success Criteria

- [ ] All 6 new document types ingestible via scrapers
- [ ] Timeline Agent v2 extracts future dates with citations
- [ ] External references ("Genvägar") scraped and stored
- [ ] Document-to-document references captured (explicit citations)
- [ ] Metadata Agent v2 extracts additional entity types
- [ ] No degradation of Phase 3 data quality (citation coverage, idempotency)
- [ ] New document types searchable via Phase 4 search interface

---

## Technical Approach

### Database Schema Extensions

#### New Tables

**1. Document References (Explicit Citations)**
```sql
CREATE TABLE document_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id UUID NOT NULL REFERENCES documents(id),
  target_document_id UUID REFERENCES documents(id), -- NULL if target not yet ingested
  target_doc_number TEXT, -- e.g., "Dir. 2024:122"
  reference_type TEXT NOT NULL, -- 'cites', 'amends', 'responds_to', 'related'
  source_page INTEGER,
  source_excerpt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_document_references_source ON document_references(source_document_id);
CREATE INDEX idx_document_references_target ON document_references(target_document_id);
```

**2. External Links**
```sql
CREATE TABLE external_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id),
  link_url TEXT NOT NULL,
  link_type TEXT NOT NULL, -- 'press_release', 'genvag', 'related'
  link_title TEXT,
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_external_links_document ON external_links(document_id);
CREATE INDEX idx_external_links_type ON external_links(link_type);
```

#### Existing Table Extensions

**documents table (no changes needed)**
- `doc_type` column already supports new types (TEXT)
- New values: 'proposition', 'remiss', 'remissvar', 'motion', 'committee_report', 'law'

**timeline_events table (no changes needed)**
- `event_type` column already supports new types (TEXT)
- New values: 'directive_issued', 'committee_formed', 'remiss_period_start', etc.

### Scrapers

#### 1. Proposition Scraper
- **Source:** https://www.regeringen.se/propositioner/
- **Target:** Propositioner (gov't legislative proposals)
- **Extraction:** Similar to SOU scraper
- **Links:** Scrape "Genvägar" for related directives and SOUs

#### 2. Remiss Scraper
- **Source:** https://www.regeringen.se/remisser/
- **Target:** Consultation documents
- **Extraction:** Consultation period dates, responding organizations

#### 3. Remissvar Scraper
- **Source:** Linked from remiss pages
- **Target:** Consultation responses
- **Entities:** Organizations/individuals submitting responses

#### 4. Motion Scraper
- **Source:** Riksdagen API or web scraping
- **Target:** Parliamentary motions
- **Entities:** Motion authors (MPs)

#### 5. Committee Report Scraper
- **Source:** Riksdagen API or web scraping
- **Target:** Utskottsbetänkanden
- **Entities:** Committee members

#### 6. Law Scraper
- **Source:** https://www.riksdagen.se/sv/dokument-och-lagar/lagar/
- **Target:** Enacted laws and regulations
- **Entities:** Referenced in propositions and committee reports

### Agent Enhancements

#### Timeline Agent v2

**Prompt additions:**
```
You are now also responsible for extracting:
1. Future scheduled dates (government decisions, delivery deadlines)
2. Additional event types (directive issued, remiss periods, etc.)

Always provide:
- event_type (one of: sou_published, directive_issued, committee_formed, remiss_period_start, remiss_period_end, proposition_submitted, law_enacted, government_decision_scheduled, delivery_planned)
- event_date (YYYY-MM-DD format, normalize partial dates)
- source_page
- source_excerpt

For future dates, use event types:
- government_decision_scheduled
- delivery_planned
```

**New tool parameters:**
```typescript
{
  name: "add_timeline_event",
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
        "law_enacted",
        "government_decision_scheduled",
        "delivery_planned"
      ]
    },
    // ... rest of parameters unchanged
  }
}
```

#### Metadata Agent v2

**Prompt additions:**
```
You are now also responsible for extracting:
1. External stakeholders (organizations submitting remissvar)
2. Referenced legislation (laws, regulations cited in documents)
3. Impact sectors (which sectors are affected)
4. Budget information (if mentioned)

Entity types now include:
- person
- ministry
- committee
- organization (new)
- legislation (new)
- sector (new)
```

**New tool parameters:**
```typescript
{
  name: "report_metadata_entity",
  parameters: {
    entity_type: {
      type: "string",
      enum: [
        "person",
        "ministry",
        "committee",
        "organization",
        "legislation",
        "sector"
      ]
    },
    // ... rest of parameters unchanged
  }
}
```

#### Document Reference Agent (New)

**Purpose:** Extract explicit document-to-document citations.

**Tool: `report_document_reference`**
```typescript
{
  name: "report_document_reference",
  description: "Report when this document explicitly cites another document",
  parameters: {
    target_doc_number: { type: "string", description: "e.g., 'Dir. 2024:122'" },
    reference_type: {
      type: "string",
      enum: ["cites", "amends", "responds_to", "related"]
    },
    source_page: { type: "integer" },
    source_excerpt: { type: "string", minLength: 50, maxLength: 300 }
  },
  required: ["target_doc_number", "reference_type", "source_page", "source_excerpt"]
}
```

**Integration:**
- Called by Head Detective for all new document types
- Creates entry in `document_references` table
- Links to `target_document_id` if document already ingested

### Head Detective v3 Orchestration

**New responsibilities:**
- Delegate to Document Reference Agent for all doc types
- Handle new document types in process staging logic
- Orchestrate Timeline Agent v2 for additional event types

---

## Testing Strategy

### Document Type Coverage

Test ingestion for each new document type:
- [ ] Proposition sample (3 docs)
- [ ] Remiss sample (3 docs)
- [ ] Remissvar sample (5 docs from different organizations)
- [ ] Motion sample (3 docs)
- [ ] Committee report sample (3 docs)
- [ ] Law sample (3 docs)

### Timeline Agent v2 Validation

- [ ] Extract future date: "Beslut vid regeringssammanträde den [date]"
- [ ] Extract future date: "Planerat överlämningsdatum [month year]"
- [ ] Extract remiss period: "Remissvar ska ha kommit in till [date]"
- [ ] Verify all new event types have citations

### External Links Validation

- [ ] Scrape "Genvägar" section from 10 sample documents
- [ ] Verify press releases captured
- [ ] Verify related directives captured
- [ ] Verify no broken links stored

### Data Quality

- [ ] Citation coverage remains 95%+
- [ ] No placeholder entities created
- [ ] Entity deduplication still working
- [ ] No duplicate timeline events
- [ ] Search interface handles new doc types

---

## Deployment Strategy

### Incremental Rollout

**Week 1-2: Database Schema**
- Create new tables (`document_references`, `external_links`)
- Run migration
- Validate schema with sample data

**Week 3-4: Timeline Agent v2**
- Enhance prompts for future date extraction
- Add new event types
- Test with SOU/Directive samples first
- Deploy to production

**Week 5-8: New Scrapers (One Per Week)**
- Week 5: Proposition scraper
- Week 6: Remiss scraper
- Week 7: Motion scraper
- Week 8: Committee report + law scrapers

**Week 9-10: Metadata Agent v2**
- Add new entity types
- Test with new document types
- Deploy to production

**Week 11-12: Document Reference Agent**
- Implement and test
- Integrate with Head Detective v3
- Deploy to production

**Week 13: Integration Testing**
- End-to-end test with all doc types
- Validate search works across all types
- Performance benchmarking

---

## Performance Considerations

### Scraper Load
- **Estimated documents:** 500+ propositions, 1000+ remisser, 5000+ remissvar
- **Ingestion strategy:** Batch processing with rate limiting
- **Priority:** Recent documents first (last 5 years)

### Agent Processing
- **Timeline Agent v2:** Same latency as v1 (~3-4s per doc)
- **Metadata Agent v2:** Slightly higher token usage with new entity types (~4-5s per doc)
- **Document Reference Agent:** Light extraction (~2-3s per doc)

### Database Growth
- **documents:** +5000-10000 rows
- **timeline_events:** +10000-20000 rows
- **entities:** +2000-5000 rows
- **document_references:** +3000-8000 rows
- **external_links:** +5000-15000 rows

**Mitigation:**
- Partition large tables by year if needed
- Monitor query performance
- Add indexes as usage patterns emerge

---

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| New scrapers fail | No new docs ingested | Incremental rollout, test one scraper at a time |
| Agent v2 creates bad data | Citation quality degrades | Comprehensive testing before production deployment |
| Database performance degradation | Slow queries | Monitor query performance, add indexes proactively |
| External links break over time | Stale references | Schedule periodic link validation job |

---

## Dependencies

### Before Starting Phase 5
- [x] Phase 3 complete (agents production-ready)
- [x] Phase 4.1 complete (search working)
- [ ] Phase 4 stable (no major bugs, user feedback incorporated)
- [ ] Decision made: Are users actually using the search feature?

### Phase 5 Prerequisites
- [ ] User feedback confirms search is valuable
- [ ] Performance benchmarks acceptable for current data volume
- [ ] Team capacity available for 13-week implementation

---

## Related Documentation

- [Phase 3: Multi-Agent AI](./phase-3-multi-agent-ai.md)
- [Phase 4: Search & Discovery](./phase-4-search-and-discovery.md)
- [Phase 6: Relationship Inference](./phase-6-relationship-inference.md)
- [Product Roadmap](../PRODUCT_ROADMAP.md)

---

## Notes

**Why Phase 5 Before Phase 6?**
- Phase 6 (case reconstruction) requires **diverse document types** to be meaningful
- Can't build directive → SOU → proposition chains without propositions in database
- External references ("Genvägar") provide explicit links for Phase 6 inference

**Extensibility Considerations:**
- New document types use existing `documents` table (just new `doc_type` values)
- New event types use existing `timeline_events` table (just new `event_type` values)
- No breaking changes to Phase 3/4 functionality
- Existing agents continue to work on SOUs/Directives
