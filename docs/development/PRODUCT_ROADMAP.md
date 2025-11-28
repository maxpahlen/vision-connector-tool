# Product Roadmap — Legislative Intelligence Platform

**Last Updated:** 2025-11-28  
**Current Phase:** Phase 4.1 ✅ Complete | Phase 4.2 Planning

---

## Development Philosophy

### Walking Skeleton First
➡️ Each phase ships a **fully autonomous, working end-to-end system** before feature expansion.  
➡️ New capabilities are **optional enrichments**, never blockers for the walking skeleton.

### Citation-First & Evidence-Based
➡️ Every extracted fact includes `source_page` + `source_excerpt`.  
➡️ No speculative reasoning or inferred relationships without verifiable evidence.

### Incremental Document Type Expansion
➡️ Phase 3: SOUs + Directives (walking skeleton)  
➡️ Phase 5: Propositions, Remisser, Remissvar, Motioner, Committee Reports, Laws  
➡️ New document types treated as **enrichment**, not blockers

---

## Phase Overview

| Phase | Status | Goal | Key Deliverables |
|-------|--------|------|------------------|
| **Phase 1** | ✅ Complete | Foundation | Database, Auth, Admin UI |
| **Phase 2** | ✅ Complete | SOU Scraper & PDF | Automated SOU ingestion, PDF extraction |
| **Phase 3** | ✅ Complete | Multi-Agent AI (Walking Skeleton) | Timeline Agent, Metadata Agent, Head Detective, State Machine |
| **Phase 4.1** | ✅ Complete | Search Walking Skeleton | Full-text search, filters, pagination, highlights |
| **Phase 4.2** | 📋 Planning | Search Enhancements | Entity autocomplete, enhanced ranking |
| **Phase 4.3** | 📋 Future | Discovery Features | Timeline viz, related docs |
| **Phase 5** | 📋 Planned | Legislative Graph Expansion | New doc types, Timeline Agent v2, Genvägar scraping |
| **Phase 6** | 📋 Planned | Relationship Inference | Blackboard agent, case reconstruction |
| **Phase 7** | 📋 Planned | Advanced Insights | Stakeholder mapping, predictions |

---

## Phase 1: Foundation ✅ COMPLETE

**Goal:** Establish database, authentication, and admin interface.

### Delivered
- PostgreSQL database schema (documents, processes, entities, relations, timeline_events)
- User authentication with role-based access (admin, user)
- Admin UI for monitoring scraper and agents
- RLS policies for data security

### Success Criteria Met
- ✅ Database schema validated
- ✅ Auth system working
- ✅ Admin users can access protected routes

---

## Phase 2: SOU Scraper & PDF Extraction ✅ COMPLETE

**Goal:** Automate SOU discovery and PDF content extraction.

### Delivered
- Scraper for regeringen.se SOU index pages
- PDF-to-text extraction service (external API)
- Document ingestion pipeline with deduplication
- Process creation linked to documents

### Success Criteria Met
- ✅ 163+ SOUs ingested
- ✅ PDF content extracted with page markers
- ✅ Documents linked to processes

**Documentation:** `docs/development/PHASE_2_COMPLETION_SUMMARY.md`

---

## Phase 3: Multi-Agent AI System (Walking Skeleton) ✅ COMPLETE

**Goal:** Build autonomous AI extraction system with citation-first architecture.

### Delivered

#### Agents
- **Timeline Agent v1:** Extracts SOU publication dates with forensic citations
- **Metadata Agent v1:** Extracts lead investigators, ministries, committees with citations
- **Head Detective v2:** Orchestrates multiple agents via blackboard pattern

#### Infrastructure
- State machine for evidence-based process staging
- Task queue with idempotent task management
- OpenAI integration with error handling and circuit breaker
- Performance monitoring and cost tracking

#### Data Quality
- 95%+ citation coverage (all data has source_page + source_excerpt)
- Entity deduplication via fuzzy name matching
- Placeholder rejection (stoplist + validation rules)
- 100% idempotent behavior

### Success Criteria Met
- ✅ All extracted data includes citations
- ✅ Process stages determined by state machine, not LLM
- ✅ Agents communicate via database (blackboard pattern)
- ✅ Head Detective orchestrates multiple agents
- ✅ End-to-end processing validated (Golden SOU test set)

### Current Limitations (By Design)
- Only extracts from SOU front matter (first 5000 chars)
- Only one timeline event type: `sou_published`
- No future-date extraction (e.g., planned committee dates)
- No external reference scraping (e.g., "Genvägar" links)
- No document-to-document relationship inference

**Documentation:** `docs/development/branches/phase-3-multi-agent-ai.md`, `docs/development/PHASE_3_REFINEMENT_SUMMARY.md`

---

## Phase 4.1: Search Walking Skeleton ✅ COMPLETE

**Goal:** Deliver fully usable end-to-end search for immediate user testing.

### Delivered

#### Backend
- Edge function `search-documents` with JWT authentication
- Full-text search (ILIKE pattern matching on title, doc_number)
- Filters: doc_types, ministries, stages, date ranges
- Pagination (20 per page, max 100)
- Highlight snippets from raw_content

#### Frontend
- Search page at `/search` (protected route)
- SearchBar with debounced input
- FilterPanel with multi-select filters
- SearchResults with highlighted excerpts
- Pagination controls

#### Performance
- < 500ms total request time
- 30s query caching via React Query
- Edge function boots in ~29–44ms

### Success Criteria Met
- ✅ Search is fast (< 1s)
- ✅ Results ranked and meaningful
- ✅ Highlight snippets show match context
- ✅ Filters reduce results meaningfully
- ✅ Pagination works naturally
- ✅ No timeline/entity features required for usability

### Intentionally Deferred to Phase 4.2+
- PostgreSQL full-text search vectors (tsvector)
- Enhanced search ranking (ts_rank)
- Entity autocomplete
- Entity detail pages
- Timeline visualization
- Related documents suggestions

**Documentation:** `docs/development/PHASE_4.1_COMPLETION_SUMMARY.md`, `docs/development/branches/phase-4-search-and-discovery.md`

---

## Phase 4.2: Search Enhancements 📋 PLANNING

**Status:** Awaiting user feedback from Phase 4.1

**Goal:** Enhance search based on real usage patterns.

### Tentative Scope
- **Entity autocomplete endpoint** (`search-entities`)
  - Typeahead search on entities.name
  - Returns top 10 matching entities
  - Integrated into SearchBar component

- **Entity detail pages** (`/entity/:id`)
  - Show all documents involving entity
  - Display relations to other entities
  - Show timeline of entity's involvement

- **Enhanced search ranking**
  - Implement PostgreSQL full-text search with tsvector
  - Use Swedish dictionary for stemming
  - Rank by ts_rank with weighted fields (title > content)

- **Performance optimizations** (if needed based on usage data)
  - Additional indexes on ministry, publication_date, current_stage
  - Materialized view for facet counts (if on-the-fly queries too slow)

### Decision Point
Scope will be refined based on:
- User feedback from Phase 4.1
- Search query patterns (what users actually search for)
- Performance bottlenecks (if any)

---

## Phase 4.3: Discovery Features 📋 FUTURE

**Status:** Deferred until Phase 4.2 complete

**Goal:** Add timeline visualization and document relationship discovery.

### Tentative Scope
- **Timeline visualization** (`/process/:id/timeline`)
  - D3 or recharts-based timeline chart
  - Filter events by type
  - Jump to source citation on click

- **Related documents sidebar**
  - "Find similar SOUs" based on shared entities
  - "Show other work by this utredare"
  - Uses relations table to find connected docs

- **Advanced filters**
  - Filter by entity involvement
  - Filter by event types in timeline

---

## Phase 5: Legislative Graph Expansion 📋 PLANNED

**Goal:** Expand beyond SOUs to build comprehensive legislative process graph.

### New Document Types
- **Propositions** (regeringens propositioner)
- **Remisser** (consultation documents)
- **Remissvar** (consultation responses)
- **Motioner** (parliamentary motions)
- **Committee Reports** (utskottsbetänkanden)
- **Laws** (lagar och förordningar)

### Timeline Agent v2 Enhancements
- **Future date extraction:**
  - "Beslut vid regeringssammanträde den 30 november 2025"
  - "Planerat överlämningsdatum i juni 2026"
- **Additional event types:**
  - directive_issued
  - committee_formed
  - remiss_period_start / remiss_period_end
  - proposition_submitted
  - law_enacted

### External Reference Scraping
- **"Genvägar" links from regeringen.se:**
  - Press releases
  - Related directives
  - Related reports
  - Amendments
  - Document bundles
- **Purpose:** Enrich cross-document linking and similarity suggestions

### Metadata Agent v2 Enhancements
- **Additional entity types:**
  - External stakeholders (who submitted remissvar)
  - Referenced legislation
  - Impact sectors
  - Budget information

### New Database Tables (Tentative)
```sql
-- New document types share existing documents table (doc_type column)
-- New event types use existing timeline_events table (event_type column)

-- Potential new tables:
CREATE TABLE document_references (
  id UUID PRIMARY KEY,
  source_document_id UUID REFERENCES documents(id),
  target_document_id UUID REFERENCES documents(id),
  reference_type TEXT, -- 'cites', 'amends', 'responds_to', 'related'
  source_page INTEGER,
  source_excerpt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE external_links (
  id UUID PRIMARY KEY,
  document_id UUID REFERENCES documents(id),
  link_url TEXT,
  link_type TEXT, -- 'press_release', 'genvag', 'related'
  link_title TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Success Criteria
- [ ] All new document types ingestible via scrapers
- [ ] Timeline Agent v2 extracts future dates with citations
- [ ] External references scraped and stored
- [ ] Document-to-document references captured
- [ ] No degradation of Phase 3 data quality

### Out of Scope
- Document-to-document relationship **inference** (Phase 6)
- Case-level reconstruction (Phase 6)
- Entity influence mapping (Phase 7)

---

## Phase 6: Relationship Inference & Case Reconstruction 📋 PLANNED

**Goal:** Build blackboard-level agent that reconstructs full legislative cases.

### Blackboard-Level Agent
**Operates across documents, not within a single document:**

- **Input:** All documents, entities, relations, timeline events in database
- **Output:** High-level case structures linking directives → SOUs → propositions → laws

### Case Reconstruction
- Which directives lead to which SOUs
- Which SOUs link to which propositions / laws
- Which remiss responses belong to which proposal
- Which organizations appear repeatedly across the chain

### Document Relationship Discovery
- Infer implicit relationships based on:
  - Shared entities
  - Shared timeline event dates
  - Directive numbers referenced in SOUs
  - SOU numbers referenced in propositions

### New Database Tables (Tentative)
```sql
CREATE TABLE legislative_cases (
  id UUID PRIMARY KEY,
  title TEXT,
  directive_id UUID REFERENCES documents(id),
  sou_id UUID REFERENCES documents(id),
  proposition_id UUID REFERENCES documents(id),
  law_id UUID REFERENCES documents(id),
  stage TEXT, -- 'directive', 'investigation', 'proposition', 'enacted'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE case_documents (
  id UUID PRIMARY KEY,
  case_id UUID REFERENCES legislative_cases(id),
  document_id UUID REFERENCES documents(id),
  role TEXT, -- 'directive', 'sou', 'remissvar', 'proposition', 'law'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Relationship-Based Search
- "Show all documents in the same legislative case as [SOU]"
- "Find all cases involving [Ministry]"
- "Show full timeline for [Case]"

### Success Criteria
- [ ] Blackboard agent identifies document-to-document relationships
- [ ] Cases reconstructed with evidence-based links
- [ ] Relationship-based search working
- [ ] Case timelines visualized end-to-end

### Out of Scope
- Predictive analytics (Phase 7)
- Stakeholder influence scoring (Phase 7)
- Change tracking (Phase 7)

---

## Phase 7: Advanced Insights & Predictions 📋 PLANNED

**Goal:** Provide intelligence layer for strategic decision-making.

### Stakeholder Influence Mapping
- Which organizations appear most frequently across cases
- Which organizations submit remissvar most often
- Which organizations' recommendations are adopted

### Entity Co-Occurrence Networks
- Visualize which entities work together
- Identify clusters of frequent collaborators
- Detect new vs recurring relationships

### Change Tracking
- Track amendments to directives over time
- Identify patterns in SOU recommendations that lead to legislation
- Measure time between directive → SOU → proposition → law

### Predicted Impact Monitoring
- Which sectors are most affected by pending legislation
- Which ministries are most active in which policy areas
- Forecasting: when will [Case] reach [Stage]

### New Database Tables (Tentative)
```sql
CREATE TABLE entity_cooccurrence (
  id UUID PRIMARY KEY,
  entity_a_id UUID REFERENCES entities(id),
  entity_b_id UUID REFERENCES entities(id),
  cooccurrence_count INTEGER,
  shared_documents UUID[], -- Array of document IDs
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE case_predictions (
  id UUID PRIMARY KEY,
  case_id UUID REFERENCES legislative_cases(id),
  predicted_stage TEXT,
  predicted_date DATE,
  confidence_score NUMERIC(3,2),
  rationale TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Success Criteria
- [ ] Stakeholder influence scores calculated
- [ ] Entity co-occurrence network visualized
- [ ] Change tracking dashboard operational
- [ ] Prediction model validated against historical data

---

## New Ideas & Where They Fit

### 1. "Genvägar" Links from regeringen.se

**What:** Scrape "Genvägar" sections on regeringen.se documents for press releases, related directives, reports, amendments.

**Why Deferred:**
- Not needed for Phase 3 walking skeleton (SOUs + Directives only)
- Not needed for Phase 4 search (searches existing data)
- **Belongs in Phase 5:** Enriches cross-document linking after new document types are ingested

**Implementation:**
- Add scraper for "Genvägar" section parsing
- Store in `external_links` table
- Use in Phase 6 relationship inference

---

### 2. Timeline Agent v2: Future Date Extraction

**What:** Extract future scheduled government dates like "Beslut vid regeringssammanträde den 30 november 2025" or "Planerat överlämningsdatum i juni 2026".

**Why Deferred:**
- Timeline Agent v1 already extracts publication dates (walking skeleton complete)
- Future dates are **high-value markers** but not blockers
- **Belongs in Phase 5:** Enhances timeline after basic extraction validated

**Implementation:**
- Expand Timeline Agent prompt to recognize future-date phrases
- Add new event types: `government_decision_scheduled`, `delivery_planned`
- Store with citation in `timeline_events` table

---

### 3. Case-Level Overview / Blackboard Agent

**What:** Agent that looks **across the blackboard** (not within a single document) to reconstruct full legislative cases.

**Why Deferred:**
- Requires **multiple document types** (directives, SOUs, propositions) to be meaningful
- Requires **sufficient relations** to build case graphs
- Depends on Phase 5 (new doc types) + Phase 5 (external references)
- **Belongs in Phase 6-7:** System-level intelligence after data foundation is complete

**Implementation:**
- New agent: `agent-case-reconstruction`
- Queries all documents, entities, relations, timeline_events
- Builds case graphs linking directives → SOUs → propositions → laws
- Stores in `legislative_cases` and `case_documents` tables

---

## Expected Database Tables & Agents Per Phase

### Phase 3 ✅ (Current)
**Tables:** documents, processes, entities, relations, timeline_events, agent_tasks  
**Agents:** Timeline Agent v1, Metadata Agent v1, Head Detective v2

### Phase 4 ✅ (Current)
**New Tables:** None (uses existing tables)  
**New Agents:** None (edge function for search, no AI agents)

### Phase 5 📋 (Planned)
**New Tables:** `document_references`, `external_links`  
**Enhanced Agents:** Timeline Agent v2, Metadata Agent v2  
**New Scrapers:** Propositioner, Remisser, Remissvar, Motioner, Committee Reports, Laws

### Phase 6 📋 (Planned)
**New Tables:** `legislative_cases`, `case_documents`  
**New Agents:** Case Reconstruction Agent (blackboard-level)  
**Enhancements:** Relationship-based search, case timeline visualization

### Phase 7 📋 (Planned)
**New Tables:** `entity_cooccurrence`, `case_predictions`, `stakeholder_influence`  
**New Agents:** Influence Mapping Agent, Prediction Agent  
**Enhancements:** Advanced analytics dashboards, forecasting

---

## Sequencing Rules (Non-Negotiable)

1. **A phase never expands until the previous phase is stable and autonomous.**
2. **Every new extraction capability must remain citation-first and deterministic.**
3. **No speculative reasoning or inferred relationships without verifiable evidence.**
4. **New document types are optional enrichments, not blockers for the walking skeleton.**
5. **User feedback from a phase must inform the next phase's scope.**

---

## Phase Transition Checklist

Before moving from Phase N to Phase N+1:

- [ ] All Phase N success criteria met
- [ ] End-to-end testing passed
- [ ] Documentation complete
- [ ] Production deployment validated (if applicable)
- [ ] User feedback collected (for user-facing phases)
- [ ] Performance benchmarks established
- [ ] Known limitations documented

---

## Conclusion

This roadmap reflects the **refined product vision** while maintaining strict development discipline:

- **Phase 3:** Walking skeleton complete (SOUs + Directives only)
- **Phase 4:** Search & discovery (current focus, walking skeleton approach)
- **Phase 5:** Legislative graph expansion (new doc types, Timeline v2, Genvägar)
- **Phase 6:** Relationship inference (blackboard agent, case reconstruction)
- **Phase 7:** Advanced insights (stakeholder mapping, predictions)

**Current Status:** Phase 4.1 complete, Phase 4.2 planning based on user feedback.

**Next Immediate Steps:**
1. Collect user feedback on Phase 4.1 search experience
2. Identify pain points and prioritize Phase 4.2 scope
3. Do NOT start Phase 5 until Phase 4 is stable and validated
