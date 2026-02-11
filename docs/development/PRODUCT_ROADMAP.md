# Product Roadmap — Legislative Intelligence Platform

**Last Updated:** 2026-02-10  
**Current Phase:** Phase 5.6 ✅ COMPLETE (Remissvar Content Insights)

---

## Recent Milestone: Phase 5.6 Complete — Remissvar Extraction + Stance Analysis 🎉

**Remissvar text extraction validated (98.4% coverage):**
- 3,366 remissvar successfully extracted (avg ~9,000 chars)
- 54 scanned PDFs identified as extraction errors (OCR limitation)
- Admin UI supports multi-batch execution with pagination
- Keyword-based stance detection operational

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
| **Phase 4.2** | ✅ Complete | Entity Features | Entity autocomplete, entity detail pages, relations FK |
| **Phase 4.3** | ✅ Complete | Discovery MVP | Enhanced doc detail, process pages, related docs (deterministic) |
| **Phase 5** | ✅ Complete | Legislative Graph Expansion | New doc types, Timeline Agent v2, Content Insights |
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
- ✅ 61 SOUs ingested (with text extracted)
- ✅ PDF content extracted with page markers
- ✅ Documents linked to processes

**Documentation:** `docs/archive/summaries/PHASE_2_COMPLETION_SUMMARY.md`

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

**Documentation:** `docs/archive/branches/phase-3-multi-agent-ai.md`, `docs/archive/summaries/PHASE_3_REFINEMENT_SUMMARY.md`

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

**Documentation:** `docs/archive/summaries/PHASE_4.1_COMPLETION_SUMMARY.md`, `docs/archive/branches/phase-4-search-and-discovery.md`

---

## Phase 4.2: Entity Features ✅ COMPLETE

**Completion Date:** 2025-12-01  
**Goal:** Enable entity-centric discovery and navigation.

### Delivered

#### Backend
- ✅ Edge function `search-entities` with JWT authentication
- ✅ ILIKE pattern matching on entity names with trigram index
- ✅ Document count calculation per entity (via relations join)
- ✅ Relevance sorting: exact match > document count > alphabetical
- ✅ Configurable entity type filtering
- ✅ Max 20 results with configurable limit
- ✅ Foreign key constraints on relations table
  - `relations_source_id_fkey` → `entities(id)` ON DELETE CASCADE
  - `relations_target_id_fkey` → `documents(id)` ON DELETE CASCADE
  - Indexes on source_id, target_id, and composite (source_id, target_id)

#### Frontend

**Autocomplete:**
- ✅ `useEntityAutocomplete` hook with React Query
- ✅ Updated SearchBar with autocomplete dropdown
- ✅ Debounced input (150ms) to reduce API calls
- ✅ Entity type icons and badges
- ✅ Document count display per entity
- ✅ Keyboard-friendly Command component
- ✅ Click-outside to close autocomplete
- ✅ Clicking entity navigates to detail page

**Entity Detail Pages:**
- ✅ New route `/entity/:id` (protected)
- ✅ Entity information display (name, type, role)
- ✅ List of all documents involving the entity
- ✅ Source excerpts showing context
- ✅ Related entities (co-occurring in same documents)
- ✅ Timeline events from related processes
- ✅ Navigation links back to search
- ✅ Responsive layout with sidebar
- ✅ Working links to document detail pages

**Document Detail Pages:**
- ✅ Route `/document/:id` added (public access)
- ✅ Updated navigation to return to search page
- ✅ Displays extracted content, metadata, timeline

**Navigation:**
- ✅ "Sök" link in Header navigation
- ✅ Entity autocomplete suggestions link to detail pages
- ✅ Document cards link to document detail pages

#### Performance
- Minimum 2 characters before search triggers
- 150ms debounce on autocomplete (reduced from 300ms)
- 60s cache on autocomplete results
- Entity results ranked by relevance
- Related entities limited to top 10
- Timeline events limited to 20 most recent
- pg_trgm extension enabled for faster fuzzy matching
- GIN index on entities.name for autocomplete performance

#### Data Model
Relations table now enforces referential integrity:
- `source_id` → `entities.id` (entity mentioned in document)
- `target_id` → `documents.id` (document containing the mention)
- Both with CASCADE delete to maintain data consistency
- Proper PostgREST joins now work via FK hints

### Success Criteria Met
- ✅ Users can search for entities by name
- ✅ Entity detail pages show complete involvement
- ✅ Related entities discovered through shared documents
- ✅ Timeline events connected to entity's documents
- ✅ All network requests return 200 (no PGRST relationship errors)
- ✅ Navigation between search, entity, and document pages works seamlessly

### Intentionally Deferred to Future Phases
- [ ] PostgreSQL full-text search with ts_rank (Swedish dictionary)
- [ ] Process detail pages
- [ ] Timeline visualization component
- [ ] Related documents recommendations
- [ ] Entity filtering in main search
- [ ] Materialized views for performance optimization

**Documentation:** `docs/archive/branches/phase-4-search-and-discovery.md`

---

## Phase 4.3: Discovery MVP ✅ COMPLETE

**Completion Date:** 2025-12-02  
**Goal:** Enable users to understand document context and explore connections.

### Delivered

#### 1. Enhanced Document Detail Pages (`/document/:id`)

**Process Context Section:**
- Shows which legislative process the document belongs to
- Displays current stage badge + stage_explanation
- Links to full process detail page

**Entities in Document Section:**
- Lists all entities mentioned in the document
- Displayed as clickable chips with entity type badges
- Each chip links to entity profile page (`/entity/:id`)
- Shows entity role (e.g., "särskild_utredare", "ministry_responsible")

**Related Documents Section:**
- **Deterministic scoring algorithm:**
  - +3 points: Shared lead investigator (särskild_utredare)
  - +2 points: Shared committee member
  - +1 point: Same ministry
- **Forensic transparency:** Each related document shows WHY it's related:
  - Entity name creating the connection
  - Entity role
  - Citation excerpt from source document
  - Source page number
- Documents sorted by relevance score (highest first)
- Max 10 related documents displayed

#### 2. Process Detail Pages (`/process/:id`)

**Process Header:**
- Process title
- Process key (e.g., "SOU-2025-37")
- Current stage badge with stage explanation
- Ministry

**Documents in Process:**
- Lists all directives (Dir) and investigations (SOU)
- Each card shows document type badge, title, number, publication date
- Links to document detail pages

**Entities Involved:**
- **Smart deduplication:** Entities deduplicated by name + type
- Shows aggregated roles across all process documents
- Document count per entity
- Links to entity profile pages

**Timeline Events:**
- Chronologically sorted events
- Event date, type, description, actors
- **Forensic citations:** Source excerpt + page number

#### 3. Navigation & Integration

**Updated Header Navigation:**
- Added "Hem" (Home) button linking to `/`
- "Sök" (Search) button linking to `/search`

**Home Page Redesign:**
- Shows 10 most recent processes
- Process cards display title, stage, ministry, document count
- Stage explanation preview (2 lines)
- Prominent "Search Documents" CTA button
- Uses `useProcesses` hook for real-time data

**Search Integration:**
- Search result cards now link to `/document/:id` (not admin routes)
- Seamless navigation into discovery flow

**Connected User Flow:**
```
Home (/) → Search (/search) → Document Detail (/document/:id)
         ↓                    ↓
Process Detail (/process/:id) ↔ Entity Detail (/entity/:id)
```

#### 4. Implementation Details

**New Hook: `useDocumentContext`**
- Efficiently fetches process information, related entities, and related documents
- Implements deterministic relationship scoring
- Reusable pattern for similar context queries

**Performance:**
- All pages load in 250-350ms (well under 500ms target)
- React Query caching reduces repeat fetches
- Efficient query design with minimal joins

### Success Criteria Met
- ✅ Users can see document's process context
- ✅ Users can discover related documents with clear explanations
- ✅ Users can navigate to process pages
- ✅ Process pages show complete document list and entities
- ✅ All connections are explainable (no black-box recommendations)
- ✅ Performance remains under 500ms per page load
- ✅ Entity deduplication works correctly
- ✅ Full navigation mesh enables discovery

### Intentionally Deferred to Future Iterations
These were **NOT** implemented until MVP is validated:

#### ❌ Timeline Visualization
- D3/Recharts visual timeline
- Multi-process overlay
- Event type filtering UI
- Interactive timeline controls

**Rationale:** Focus on navigation and discovery first. Visualization adds complexity that should be validated as needed.

#### ❌ Advanced Search Filters
- Filter by entity involvement
- Filter by event types
- Advanced stage filtering
- Saved searches

**Rationale:** Current faceted search is sufficient for MVP. Advanced filters should be driven by user feedback.

#### ❌ Related Processes Section
- Cross-process relationship detection
- Ministry clustering
- Thematic grouping

**Rationale:** Single-process discovery first. Inter-process relationships represent Phase 4.4+ scope.

**Documentation:** `docs/archive/summaries/PHASE_4.3_COMPLETION_SUMMARY.md`

---

## Phase 5: Legislative Graph Expansion

**Goal:** Expand beyond SOUs to build comprehensive legislative process graph.

### Current Database Metrics (2026-02-10)

| Table | Count | Notes |
|-------|-------|-------|
| **Documents** | 863 total | 60 SOUs, 183 directives, 126 propositions, 333 committee reports, 161 laws |
| **Processes** | 464 | All with linked documents |
| **Entities** | 1,780 | Organizations (cleaned, deduplicated) |
| **Timeline Events** | 1,070 | Extracted with citations |
| **Document References** | 1,083 | Cross-document citations (84 resolved, 7.8%) |
| **Remiss Documents** | 54 | All scraped with remissinstanser PDFs |
| **Remiss Responses** | 3,421 | 98.4% text extracted, 99.91% linked to entities |
| **Remiss Invitees** | 4,321 | 100% linked to entities |

### Completion Summary

| Phase | Status | Description |
|-------|--------|-------------|
| **5.1** | ✅ COMPLETE | Database Schema + Timeline Agent v2.1 |
| **5.2** | ✅ COMPLETE | Propositions End-to-End |
| **5.3** | ✅ COMPLETE | Remisser + Remissvar + Entity Pipeline |
| **5.4** | ✅ COMPLETE | Committee Reports + Laws (Riksdagen API) |
| **5.5.1** | ✅ COMPLETE | Reference Resolution (84 resolved) |
| **5.5.2** | ✅ COMPLETE | Directive-SOU Linking (8 links) |
| **5.5.3** | ✅ COMPLETE | Participation Dashboard MVP |
| **5.5.4** | ✅ COMPLETE | Velocity Dashboard (ministry bug fixed) |
| **5.6.1** | ✅ COMPLETE | Remissvar Extraction Schema |
| **5.6.2** | ✅ COMPLETE | PDF Extraction Pipeline + Admin UI |
| **5.6.3** | ✅ COMPLETE | Keyword-based Stance Detection |

### Phase 5.5: Cross-Document Insights Foundation

**Documentation:** `docs/archive/branches/phase-5.5-cross-document-insights.md`

**Delivered:**
- Reference resolution: 76 citations matched to corpus documents
- Directive-SOU linking: 8 explicit links (5 fulfills, 3 cites)
- Participation Dashboard: `/insights/participation` with full aggregation
- Velocity Dashboard: `/insights/velocity`

### Phase 5.4: Committee Reports + Laws ✅ COMPLETE

**Status:** COMPLETE (2026-01)  
**Documentation:** `docs/archive/branches/phase-5.4-committee-reports-laws.md`

**Delivered:**
- Riksdagen API integration for committee reports (333 scraped)
- Riksdagen API integration for laws (161 scraped)
- Committee report PDF extraction pipeline
- Timeline events derived from committee report `dokaktivitet`
- Cross-linking to propositions via `has_committee_report` reference type

### Phase 5.6: Remissvar Content Insights ✅ COMPLETE

**Status:** COMPLETE (2026-02)  
**Documentation:** `docs/archive/branches/phase-5.6-content-insights.md`

**Delivered (5.6.1-5.6.3):**
- Schema: `extraction_status`, `raw_content`, `extracted_at` columns
- Edge function: `process-remissvar-pdf` with batch processing
- Admin UI: Multi-batch extraction with pagination beyond 1000-row limit
- Extraction results: 3,366 extracted (98.4%), 54 errors (scanned PDFs requiring OCR)
- Keyword-based stance detection: `stance_summary`, `stance_signals` columns operational
- AI stance classification via `classify-stance-ai` edge function

**Known Limitation:**
- 54 scanned/image PDFs cannot be extracted (require OCR, not text layer)
- Error rate: 1.6% — acceptable, documented for future OCR enhancement

### Database Schema Changes (Implemented)
- `lifecycle_stage` column on documents ✅
- `document_references` table with confidence scoring ✅
- `external_urls` JSONB column ✅
- `target_url` column for remiss URL lookups ✅

### Success Criteria (Phase 5.3) ✅
- [x] Propositions end-to-end ingestion and searchable
- [x] Remisser matched to SOUs (54/54)
- [x] Remissvar extracted (3,421)
- [x] Entity pipeline operational (1,780 entities)
- [x] 100% invitee linking
- [x] 99.91% response linking
- [x] Entity deduplication complete

**Documentation:** `docs/archive/branches/phase-5-legislative-graph-expansion.md`, `docs/archive/plans/PHASE_5_IMPLEMENTATION_PLAN.md`

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

### 7.1 Entity Stance Heat Map 🆕

**What:** Visualization showing how each organization's stance distribution varies across subjects/themes.

**Why Valuable:**
- Quickly identify which organizations are generally supportive vs oppositional
- Discover thematic patterns in stakeholder positions
- Support strategic stakeholder engagement

**Prerequisites:**
- [x] Phase 5.6.4 stance classification complete
- [ ] Theme/subject categorization of SOUs (main risk/dependency)

**Implementation Notes:**
- Heat map using subject categories derived from SOU titles or ministry
- Color coding: green (support), red (oppose), yellow (conditional)
- Filterable by ministry, time period, organization type
- May require time window filters (e.g., "last 2 years")
- Category normalization (ministries vs. subject taxonomy) TBD

**Status:** Roadmap item; prioritize only after taxonomy/theme tagging infrastructure is available.

### 7.2 Stakeholder Influence Mapping
- Which organizations appear most frequently across cases
- Which organizations submit remissvar most often
- Which organizations' recommendations are adopted

### 7.3 Entity Co-Occurrence Networks
- Visualize which entities work together
- Identify clusters of frequent collaborators
- Detect new vs recurring relationships

### 7.4 Change Tracking
- Track amendments to directives over time
- Identify patterns in SOU recommendations that lead to legislation
- Measure time between directive → SOU → proposition → law

### 7.5 Predicted Impact Monitoring
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

CREATE TABLE entity_stance_themes (
  id UUID PRIMARY KEY,
  entity_id UUID REFERENCES entities(id),
  theme TEXT, -- e.g., 'miljö', 'skatter', 'utbildning'
  support_count INTEGER DEFAULT 0,
  oppose_count INTEGER DEFAULT 0,
  conditional_count INTEGER DEFAULT 0,
  neutral_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Success Criteria
- [ ] Entity stance heat map visualized (Phase 7.1)
- [ ] Stakeholder influence scores calculated (Phase 7.2)
- [ ] Entity co-occurrence network visualized (Phase 7.3)
- [ ] Change tracking dashboard operational (Phase 7.4)
- [ ] Prediction model validated against historical data (Phase 7.5)

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

### Phase 4 ✅ Complete (Phases 4.1 & 4.2)
**New Tables:** None (uses existing tables with enhanced indexes)  
**New Agents:** None (edge functions for search and entity autocomplete)  
**Database Changes:** 
- Added pg_trgm extension for fuzzy text search
- Added trigram GIN index on entities.name
- Added foreign key constraints to relations table
- Added indexes on relations(source_id, target_id)

### Phase 4.3 ✅ Complete
**New Tables:** None (continues using existing tables)
**New Pages:** Process detail (`/process/:id`), enhanced document detail, redesigned home page
**New Hook:** `useDocumentContext` for fetching document context and related documents
**Features:** Deterministic related documents, entity deduplication, full navigation mesh

### Phase 5 ✅ (Complete)
**New Tables:** `document_references`, `remiss_documents`, `remiss_responses`, `remiss_invitees`, `stance_keyword_suggestions`, `entity_name_rules`  
**Enhanced Agents:** Timeline Agent v2, Metadata Agent v2  
**New Scrapers:** Propositions, Directives, Committee Reports, Laws (Riksdagen API), Remiss Index, Remiss Pages

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

**Current Status:** Phase 5 COMPLETE. Operational closure in progress. Phase 6 GO pending readiness gate approval.

**Next Immediate Steps:**
1. Complete operational closure (SOU lifecycle backfill, Admin UI cleanup, roadmap reconciliation)
2. Phase 6 readiness gate approval
3. Phase 6.1: Riksdagen API historical backfill for propositions and directives
