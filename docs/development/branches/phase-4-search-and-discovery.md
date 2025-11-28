# Phase 4: Search & Discovery

**Status:** Phase 4.1 ✅ COMPLETE | Phase 4.2 Planning  
**Branch:** `phase-4-search-and-discovery`  
**Dependencies:** Phase 3 (Multi-Agent AI System)

---

## Purpose

Build powerful search and discovery capabilities on top of Phase 3's structured data (timeline events, entities, relations). Enable users to find SOUs, processes, and insights through multiple search modalities.

**Strategy:** Walking skeleton approach — deliver usable functionality incrementally with user testing driving priorities.

---

## Phase 4.1 — Walking Skeleton ✅ COMPLETE

**Completion Date:** 2025-11-28  
**Detailed Summary:** See `docs/development/PHASE_4.1_COMPLETION_SUMMARY.md`

### What Was Delivered

#### Backend
- ✅ Edge function `search-documents` with JWT authentication and RLS
- ✅ Full-text search using ILIKE pattern matching on `title`, `doc_number`
- ✅ Filters: `doc_types`, `ministries`, `stages`, `date_from`, `date_to`
- ✅ Pagination (default 20 per page, max 100)
- ✅ Highlight snippets extracted from `raw_content`
- ✅ Results ranked by publication date (descending)

#### Frontend
- ✅ Search page at `/search` (protected route)
- ✅ `SearchBar` component with debounced input
- ✅ `FilterPanel` with multi-select checkboxes and date pickers
- ✅ `SearchResults` with cards showing highlights and metadata
- ✅ Pagination controls
- ✅ `useSearch` React Query hook with 30s caching

#### Critical Bug Fixed
- ✅ JWT forwarding to edge function for proper RLS authentication

### Performance
- Edge function boot: ~29–44ms
- Query execution: ~150–300ms
- Total request time: < 500ms

### Test Results
All Phase 4.1 success criteria met:
- ✅ Search is fast (< 1s)
- ✅ Results are ranked and meaningful
- ✅ Highlight snippets show matching context
- ✅ Filters meaningfully reduce results
- ✅ Pagination works naturally
- ✅ No timeline/entity features required for usability

### Intentionally Deferred to Phase 4.2+
- ❌ PostgreSQL full-text search vectors (tsvector)
- ❌ GIN indexes for search optimization
- ❌ Entity autocomplete
- ❌ Entity detail pages
- ❌ Timeline visualization
- ❌ Related documents suggestions
- ❌ Materialized views for facet counts

---

## Phase 4.2 — Planned Next

**Status:** Planning (awaiting user feedback from Phase 4.1)

**Tentative Scope:**
- Entity autocomplete endpoint (`search-entities`)
- Entity detail pages (`/entity/:id`)
- Enhanced search ranking (PostgreSQL `ts_rank` with Swedish dictionary)
- Performance optimizations based on real usage data

**Decision Point:** Will be scoped based on user feedback from Phase 4.1

---

## Phase 4.3 — Future

**Status:** Planning (deferred until Phase 4.2 complete)

**Tentative Scope:**
- Timeline visualization with D3/recharts
- Related documents sidebar
- Advanced filters (entity involvement, event types)
- Saved searches

---

## Original Vision (for reference)

The sections below represent the **full vision** for Phase 4. They are being delivered incrementally via sub-phases based on real usage feedback.

## Rough Goals (Full Scope)

### 1. Full-Text Search
- Search across `documents.raw_content` and `processes.title`
- PostgreSQL full-text search with ranking
- Highlight matching excerpts in results

### 2. Faceted Search
- Filter by:
  - Ministry
  - Document type (SOU, directive, proposition)
  - Date ranges
  - Process stage
  - Entities (utredare, agencies)

### 3. Entity-Centric Views
- "Show all processes led by [Person Name]"
- "Show all SOUs from [Ministry]"
- Entity detail pages with timeline of involvement

### 4. Timeline Views
- Visual timeline of legislative processes
- Filter events by type (directive, publication, remiss)
- Jump to source citation on click

### 5. Related Documents
- "Find similar SOUs" (based on entities, ministry, topics)
- "Show other work by this utredare"

---

## Interaction with Phase 3 Data

### Leverages:
- `timeline_events` with citations → visual timelines
- `entities` + `relations` → entity-centric search
- `processes.current_stage` → filter by lifecycle stage
- `documents.metadata` → faceted filtering

### Extends:
- Add search indexes on key fields
- Possibly add `tsvector` columns for full-text search
- May add `topics` or `tags` extracted by future AI agents

---

## Technical Considerations

### PostgreSQL Full-Text Search
```sql
ALTER TABLE documents 
ADD COLUMN search_vector tsvector 
GENERATED ALWAYS AS (
  to_tsvector('swedish', coalesce(title, '') || ' ' || coalesce(raw_content, ''))
) STORED;

CREATE INDEX documents_search_idx ON documents USING GIN(search_vector);
```

### Edge Functions
- `search-documents` - unified search API
- `get-entity-timeline` - entity-centric views
- `suggest-related` - recommendation engine

### Frontend Components
- SearchBar with autocomplete
- FilterPanel for facets
- TimelineVisualization (D3 or similar)
- EntityCard components

---

## Open Questions

1. **Swedish language search:** Need special tokenization/stemming?
   - Investigate PostgreSQL Swedish dictionaries
   - Consider Algolia or Typesense if needed

2. **Performance:** How to handle search on 1000+ documents?
   - Start with PostgreSQL FTS
   - Monitor query performance
   - Consider materialized views if needed

3. **Relevance ranking:** How to surface most useful results?
   - Combine text relevance with citation count
   - Boost recent documents
   - Personalize based on user's ministry/interest

4. **Real-time updates:** Should search index update immediately?
   - Yes, trigger on document insert/update
   - Use background jobs if indexing is slow

---

## Success Criteria

### Phase 4.1 (Complete)
- [x] Users can find SOUs by keyword in <1 second
- [x] Faceted filters reduce result sets meaningfully
- [x] Search results include citation snippets
- [x] Authentication/RLS properly enforced
- [x] Pagination works smoothly
- [x] Users can start using the product immediately

### Phase 4.2+ (Future)
- [ ] Entity pages show complete involvement timeline
- [ ] "Related documents" feature surfaces useful connections
- [ ] Full-text search ranking with Swedish language support
- [ ] Autocomplete for entity names

---

## Future Enhancements

- Semantic search (embeddings + vector search)
- Natural language queries ("show me all climate-related SOUs from 2023")
- Saved searches and alerts
- Export search results to CSV/PDF
