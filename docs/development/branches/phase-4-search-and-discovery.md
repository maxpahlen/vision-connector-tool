# Phase 4: Search & Discovery

**Status:** Planning  
**Branch:** `phase-4-search-discovery`  
**Dependencies:** Phase 3 (Multi-Agent AI System)

---

## Purpose

Build powerful search and discovery capabilities on top of Phase 3's structured data (timeline events, entities, relations). Enable users to find SOUs, processes, and insights through multiple search modalities.

---

## Rough Goals

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

- [ ] Users can find SOUs by keyword in <1 second
- [ ] Faceted filters reduce result sets meaningfully
- [ ] Entity pages show complete involvement timeline
- [ ] Search results include citation snippets
- [ ] "Related documents" feature surfaces useful connections

---

## Future Enhancements

- Semantic search (embeddings + vector search)
- Natural language queries ("show me all climate-related SOUs from 2023")
- Saved searches and alerts
- Export search results to CSV/PDF
