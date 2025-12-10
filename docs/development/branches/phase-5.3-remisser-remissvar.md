# Phase 5.3: Remisser + Remissvar

**Branch**: `phase-5-legislative-graph-expansion`  
**Status**: 🚧 In Progress  
**Started**: 2025-12-10  

---

## Overview

Phase 5.3 implements the ingestion of Swedish government consultation documents (remisser) and their responses (remissvar). This phase follows the walking skeleton approach, starting with SOU-linked remisser and expanding to the full remiss index.

---

## Objectives

### Primary Goals
1. **SOU-Linked Remiss Discovery**: For each SOU in our database, find associated remiss pages via Lagstiftningskedja/Genvägar links
2. **Remissvar Extraction**: Parse remiss pages to extract all remissvar documents and their responding organizations
3. **Data Linkage**: Create proper relationships between SOUs, remiss documents, and individual remissvar files

### Secondary Goals (After Phase 1 Validation)
- Scrape the full remiss index at regeringen.se/remisser
- Match remisser to SOUs by title/document number
- Extract stakeholder organizations as entities

---

## Database Schema

### remiss_documents
Tracks remiss pages linked to parent SOUs:
```sql
- id (uuid, PK)
- parent_document_id (uuid, FK → documents)
- remiss_page_url (text, unique)
- remissinstanser_pdf_url (text, nullable)
- title (text)
- remiss_deadline (date)
- status (text: pending, scraped, failed)
- remissvar_count (integer)
- metadata (jsonb)
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
- [x] Admin UI component for testing
- [ ] Validate on 10+ SOUs with working remiss chains

### Phase 2: Remiss Index Scraping (After Validation)
- [ ] Scraper for regeringen.se/remisser with pagination
- [ ] Title matching to link orphan remisser to SOUs
- [ ] Deduplication against existing remiss_documents

### Phase 3: Fallback Search (Optional, Approval Required)
- [ ] Site search for unmatched SOUs
- [ ] Manual review queue for low-confidence matches

---

## Edge Functions

### scrape-sou-remiss
**Purpose**: Scan SOU documents for remiss links and extract remissvar

**Input**:
```json
{
  "document_id": "uuid (optional, process single SOU)",
  "limit": 10,
  "skip_existing": true
}
```

**Output**:
```json
{
  "success": true,
  "summary": {
    "total_processed": 10,
    "success": 3,
    "no_remiss": 5,
    "errors": 1,
    "skipped": 1,
    "total_remissvar": 45
  },
  "results": [...]
}
```

**Logic**:
1. Query SOU documents with URLs from database
2. For each SOU, fetch its regeringen.se page
3. Search for remiss links in Lagstiftningskedja/Genvägar sections
4. If found, fetch and parse the remiss page
5. Extract all remissvar document links
6. Store in remiss_documents and remiss_responses tables

---

## Known Patterns

### Remiss Link Detection
Remiss links typically appear in:
- `.publication-shortcuts` containers
- Links containing `/remisser/` in href
- Links with text including "Remiss" (excluding "Remissvar")

### Remissvar Document Patterns
- PDFs with organization names in filenames
- Links in download sections
- Text containing "remissvar" or "yttrande"

### Remissinstanser
Some remiss pages include a PDF listing all invited organizations:
- Filename often contains "remissinstans" or "sändlista"
- Stored separately for reference

---

## Success Criteria

Phase 5.3 Skeleton is complete when:
1. ✅ Database schema deployed
2. ✅ Edge function operational
3. ✅ Admin UI for testing
4. [ ] 10+ SOUs with working remiss→remissvar chains stored
5. [ ] All documents stored with correct types
6. [ ] Logging confirms working pattern

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

### Detailed Remiss Stats
```sql
SELECT 
  rd.status,
  COUNT(*) as count,
  SUM(rd.remissvar_count) as total_remissvar
FROM remiss_documents rd
GROUP BY rd.status;
```

### Top Organizations
```sql
SELECT 
  responding_organization,
  COUNT(*) as response_count
FROM remiss_responses
WHERE responding_organization IS NOT NULL
GROUP BY responding_organization
ORDER BY response_count DESC
LIMIT 20;
```

---

## Related Documentation

- [Phase 5 Implementation Plan](../PHASE_5_IMPLEMENTATION_PLAN.md)
- [Phase 5.2 Completion Summary](../PHASE_5.2_COMPLETION_SUMMARY.md)
- [Scraper Known Issues](../SCRAPER_KNOWN_ISSUES.md)

---

## Next Steps After Validation

1. Expand to Dir. and Proposition documents
2. Parse responding organizations more accurately
3. Create entities for stakeholder organizations
4. Add Timeline Agent v2.3 for remiss-specific events (remiss_period_start, remiss_period_end)
5. UI integration for displaying remissvar on Document Detail pages
