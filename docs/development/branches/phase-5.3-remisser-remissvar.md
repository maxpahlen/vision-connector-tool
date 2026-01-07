# Phase 5.3: Remisser + Remissvar

**Branch**: `phase-5-legislative-graph-expansion`  
**Status**: 🚧 In Progress  
**Started**: 2025-12-10  

---

## Overview

Phase 5.3 implements the ingestion of Swedish government consultation documents (remisser) and their responses (remissvar). 

### Primary Strategy: Scrape → Match

The primary discovery strategy is to **scrape the remiss index directly** and then **match remisser to SOUs/Directives/Propositions by title/document number**. This approach was chosen because:

1. **Only ~10% of SOUs have remiss links** in their Lagstiftningskedja sections
2. **The remiss index is comprehensive** - all remisser are listed at regeringen.se/remisser
3. **Title matching is reliable** - remiss titles typically include the document number (e.g., "Remiss av SOU 2025:44")

### Secondary Strategy: SOU-Linked Discovery (Limited Use)

Finding remiss links via SOU Lagstiftningskedja pages is a **secondary, fallback approach** with limited effectiveness. It only works for the minority of SOUs that happen to have remiss links on their pages.

---

## Coverage Baseline (2025-12-10)

Initial analysis revealed:
- **Total SOUs**: 71
- **SOUs with remiss references in document_references**: Very few (~10%)
- **Propositions with remiss references**: 65

This confirms we must rely on direct index scraping with title matching.

---

## Objectives

### Primary Goals
1. **Remiss Index Scraping**: Scrape regeringen.se/remisser to discover all remiss documents
2. **Title Matching**: Match remisser to SOUs/Dir./Prop. by parsing document numbers from titles
3. **Remissvar Extraction**: Parse remiss pages to extract all remissvar documents and their responding organizations
4. **Data Linkage**: Create proper relationships between documents, remiss pages, and remissvar files

### Secondary Goals
- Extract stakeholder organizations as entities
- Handle orphan remisser (those that don't match any document in our database)

---

## Discovery Strategy

### Primary: Remiss Index Scraping (Phase 2)

1. **Scrape `regeringen.se/remisser`** via Filter API with pagination
2. **Parse each listing** to extract:
   - Title (contains document references like "SOU 2025:44", "Dir. 2024:12")
   - Remiss page URL
   - Publication date
3. **Match to documents** in our database by doc_number
4. **Store matched remisser** in `remiss_documents` table
5. **Track orphans** for future document ingestion

Edge function: `scrape-remiss-index`

**⚠️ PAGINATION NOTE**: URL-based pagination (e.g., `?p=` or `?page=`) does NOT work for server-side scraping. The remiss index scraper uses regeringen.se's internal `/Filter/GetFilteredItems` endpoint with `preFilteredCategories=2099` (Remiss category). See `SCRAPER_KNOWN_ISSUES.md` for details.

### Secondary: SOU Page Scraping (Phase 1 - Limited)

~~Primary~~ **Fallback** approach for when remiss index matching fails:

1. Check `document_references` for links containing remiss URLs
2. Scrape SOU pages for Lagstiftningskedja/Genvägar sections
3. Only accept URLs matching pattern: `/remisser/YYYY/MM/...`

Edge function: `scrape-sou-remiss`

**Note**: This approach has low yield (~10% of SOUs) and should not be relied upon as the primary discovery method.

---

## Database Schema

### remiss_documents
Tracks remiss pages linked to parent documents:
```sql
- id (uuid, PK)
- parent_document_id (uuid, FK → documents)
- remiss_page_url (text, unique)
- remissinstanser_pdf_url (text, nullable)
- title (text)
- remiss_deadline (date)
- status (text: pending, scraped, failed)
- remissvar_count (integer)
- metadata (jsonb) -- includes discovery_method
- created_at, updated_at (timestamptz)
```

### remiss_responses
Tracks individual remissvar files:
```sql
- id (uuid, PK)
- remiss_id (uuid, FK → remiss_documents)
- document_id (uuid, FK → documents, nullable)
- file_url (text)
- filename (text)
- responding_organization (text, nullable)
- file_type (text: pdf, word, excel, other)
- status (text: pending, processed, skipped_non_pdf)
- metadata (jsonb)
- created_at (timestamptz)
```

---

## Implementation Phases

### Phase 1: SOU-Linked Remisser (Walking Skeleton) ✅
- [x] Database migration for remiss_documents and remiss_responses tables
- [x] Edge function `scrape-sou-remiss` to find remiss links from SOU pages
- [x] Parse remiss pages to extract remissvar documents
- [x] Admin UI component for testing (`RemissScraperTest`)
- [x] Strict URL validation to reject generic /remisser/ page
- [x] Two-phase discovery (references → page scrape)

**Note**: This phase has limited effectiveness (~10% of SOUs have remiss links).

### Phase 2: Remiss Index Scraping ✅ COMPLETE
- [x] Edge function `scrape-remiss-index` with Filter API pagination
- [x] Title parsing to extract SOU/Dir. references
- [x] Matching logic to link remisser to documents
- [x] Deduplication against existing remiss_documents
- [x] Admin UI component (`RemissIndexScraperTest`)
- [x] Execute initial scrape: **54 remisser matched to 52 unique SOUs**

### Phase 2.5: Process Remiss Pages ✅ COMPLETE
- [x] Shared parser: `_shared/remiss-parser.ts` (extracted from scrape-sou-remiss)
- [x] Edge function `process-remiss-pages` with idempotent upserts
- [x] Status transitions: `discovered` → `scraped` | `failed`
- [x] Admin UI component (`ProcessRemissPagesTest`)
- [x] Execute batch processing: **54 remiss pages scraped**
- [x] Verify remiss_responses: **3,424 remissvar extracted**

### Phase 2.7: Remissinstanser & Remissvar Processing 📋 PLANNED
- [ ] Parse remissinstanser PDFs → extract invited organizations list
- [ ] Link remissvar to entities → match `responding_organization` to `entities` table
- [ ] Create remissvar → document links → populate `remiss_responses.document_id`

### Phase 3: Orphan Resolution (Future)
- [ ] Handle unmatched remisser (document not in database)
- [ ] Priority queue for ingesting missing documents
- [ ] Manual review interface for ambiguous matches

---

## Edge Functions

### scrape-remiss-index (Primary - Phase 2) ✅
**Purpose**: Scrape the remiss index and match to documents in database

**Input**:
```json
{
  "page": 1,
  "max_pages": 10,
  "dry_run": true
}
```

**Output**:
```json
{
  "success": true,
  "summary": {
    "pages_scraped": 10,
    "total_listings": 120,
    "matched": 45,
    "orphaned": 75,
    "errors": 0
  },
  "matched": [...],
  "orphan": [...]
}
```

### process-remiss-pages (Phase 2.5) 🆕
**Purpose**: Fetch discovered remiss pages to extract remissvar

**Input**:
```json
{
  "limit": 20,
  "remiss_id": "uuid (optional)",
  "retry_failed": false,
  "dry_run": true
}
```

**Output**:
```json
{
  "success": true,
  "summary": {
    "total": 20,
    "scraped": 18,
    "failed": 2,
    "skipped": 0,
    "total_remissvar_inserted": 234,
    "dry_run": false
  },
  "results": [...]
}
```

**Status Transitions**:
- `discovered` → `scraped` (success)
- `discovered` → `failed` (error, with metadata.error)
- `failed` → `scraped` (via retry_failed=true)

### scrape-sou-remiss (Secondary/Fallback)
**Purpose**: Scan SOU documents for remiss links (limited effectiveness)

**Input**:
```json
{
  "document_id": "uuid (optional)",
  "limit": 10,
  "skip_existing": true
}
```

**Note**: Only ~10% of SOUs have remiss links. Use `scrape-remiss-index` as primary discovery.

---

## Admin UI Components

### RemissDiscoveryDashboard
- Location: `src/components/admin/RemissDiscoveryDashboard.tsx`
- Purpose: View current remiss coverage statistics

### RemissIndexScraperTest (Primary - Phase 2)
- Location: `src/components/admin/RemissIndexScraperTest.tsx`
- Purpose: Run and monitor `scrape-remiss-index` edge function
- Controls: Start page, max pages, dry run toggle
- Results: Summary stats, matched/orphan tables

### ProcessRemissPagesTest (Phase 2.5) 🆕
- Location: `src/components/admin/ProcessRemissPagesTest.tsx`
- Purpose: Process discovered remiss pages to extract remissvar
- Controls: Batch size, specific remiss ID, retry failed, dry run
- Shows: Status counts (discovered/scraped/failed), results table

### RemissScraperTest (Secondary - Phase 1)
- Location: `src/components/admin/RemissScraperTest.tsx`
- Purpose: Run `scrape-sou-remiss` for SOU-linked discovery
- Note: Limited effectiveness, use for fallback/debugging only

---

## Success Criteria

Phase 5.3 is complete when:
1. ✅ Database schema deployed
2. ✅ Edge functions operational (scrape-remiss-index, process-remiss-pages, scrape-sou-remiss)
3. ✅ Remiss Index scraper executed: **54 matched remisser**
4. ✅ Admin UI for all scrapers
5. ✅ Process remiss pages executed: **3,424 remissvar extracted**
6. [ ] Remissinstanser PDFs parsed → invited organizations extracted
7. [ ] Remissvar linked to entities and documents
8. [ ] Orphan remisser documented for future ingestion

---

## Validation Queries

### Coverage Summary
```sql
SELECT
  COUNT(*) AS total_sous,
  COUNT(*) FILTER (WHERE id IN (SELECT parent_document_id FROM remiss_documents)) AS with_remiss,
  (SELECT COUNT(*) FROM remiss_documents) AS total_remiss_docs,
  (SELECT SUM(remissvar_count) FROM remiss_documents) AS total_remissvar
FROM documents
WHERE doc_type = 'sou';
```

### Remiss by Discovery Method
```sql
SELECT 
  metadata->>'discovery_method' as method,
  COUNT(*) as count
FROM remiss_documents
GROUP BY metadata->>'discovery_method';
```

### Orphan Count (Unmatched Remisser)
```sql
-- This would be tracked in scrape results, not in DB
-- Orphans are remisser that reference documents not in our database
```

---

## Related Documentation

- [Phase 5 Implementation Plan](../PHASE_5_IMPLEMENTATION_PLAN.md)
- [Phase 5.2 Completion Summary](../PHASE_5.2_COMPLETION_SUMMARY.md)
- [Phase 5.3 Remiss Fix Follow-up](../PHASE_5.3_REMISS_FIX_FOLLOWUP.md)

---

## Changelog

- **2026-01-07**: Phase 2.5 complete — 54 remisser scraped, 3,424 remissvar extracted
- **2026-01-07**: Phase 2.5 implementation — shared parser, process-remiss-pages function, UI
- **2026-01-06**: Phase 2 complete — Filter API pagination fixed, 54 remisser matched
- **2026-01-05**: Clarified primary strategy is Scrape→Match (remiss index), not Lagstiftningskedja links
- **2025-12-11**: Added target_url column for better remiss link tracking
- **2025-12-10**: Initial implementation with SOU-linked discovery
