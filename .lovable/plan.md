
# Phase 5.4: Committee Reports + Laws — Implementation Plan

## Summary
Implement scrapers for committee reports (betänkanden) and laws (SFS) from the riksdagen.se Open Data API, with validated cross-linking for betänkanden and deferred linking for laws.

---

## Validation Findings

### What Works Well
| Data Element | Status | Notes |
|--------------|--------|-------|
| Betänkande → Proposition linking | ✅ Working | `dokreferens[referenstyp=behandlar]` provides `ref_dok_id` for proposition |
| Betänkande timeline activities | ✅ Working | `dokaktivitet` contains Justering, Bordläggning, Beslut dates |
| Betänkande PDF attachments | ✅ Working | `dokbilaga.bilaga[].fil_url` |
| SFS text content | ✅ Working | Embedded in JSON or via `.text` endpoint |
| Pagination | ✅ Working | `@nasta_sida` provides next page URL |

### Known Limitation
| Issue | Impact | Mitigation |
|-------|--------|------------|
| SFS → Proposition linking | No direct API support | Laws ingested without proposition link; add heuristic linking in future phase |

---

## Phase 5.4.1: Committee Reports Scraper

### Edge Function
Create `supabase/functions/scrape-committee-reports/index.ts`

### API Endpoints Used
```text
List:   GET https://data.riksdagen.se/dokumentlista/?doktyp=bet&rm={session}&utformat=json&sz=100&p={page}
Detail: GET https://data.riksdagen.se/dokumentstatus/{dok_id}.json
```

### Data Mapping
| API Field | DB Column | Notes |
|-----------|-----------|-------|
| `dok_id` | `doc_number` | Full ID as unique key (e.g., "HC01SkU18") |
| `titel` | `title` | |
| `rm` | - | Session (e.g., "2024/25"), stored in metadata |
| `organ` | - | Committee code (e.g., "SkU"), stored in metadata |
| `datum` | `publication_date` | |
| `dokbilaga.bilaga[0].fil_url` | `pdf_url` | First PDF attachment |
| - | `doc_type` | Set to `'committee_report'` |
| - | `lifecycle_stage` | Set to `'parliament'` |

### Cross-Reference Extraction
From `dokumentstatus/{dok_id}.json`, extract:
```javascript
const refs = data.dokumentstatus.dokreferens?.referens || [];
const propRefs = refs.filter(r => r.referenstyp === 'behandlar' && r.ref_dok_typ === 'prop');
```

For each proposition reference, create `document_references` entry:
- `source_document_id` = betänkande ID
- `target_doc_number` = `Prop. {ref_dok_rm}:{ref_dok_bet}` (e.g., "Prop. 2021/22:273")
- `reference_type` = `'recommends'`
- `confidence` = `'high'`

### Timeline Event Extraction
From `dokaktivitet.aktivitet[]`, create timeline events:
- `BES` (Beslut) → `parliament_decision` event
- `AVG` (Avgörande) → `parliament_vote` event (if distinct from BES)

### Error Handling
- Implement 500ms delay between requests
- Retry with exponential backoff on 429/503
- Log and continue on individual document failures

---

## Phase 5.4.2: Laws Scraper

### Edge Function
Create `supabase/functions/scrape-laws/index.ts`

### API Endpoints Used
```text
List: GET https://data.riksdagen.se/dokumentlista/?doktyp=sfs&rm={year}&utformat=json&sz=100&p={page}
Text: GET https://data.riksdagen.se/dokument/{dok_id}.text
```

### Data Mapping
| API Field | DB Column | Notes |
|-----------|-----------|-------|
| `dok_id` | - | Not used as doc_number (format: "sfs-2024-1000") |
| `beteckning` | `doc_number` | SFS number (e.g., "2024:1000") |
| `titel` | `title` | |
| `organ` | `ministry` | Issuing department |
| `datum` | `publication_date` | Utfärdad date |
| `text` | `raw_content` | From JSON or `.text` endpoint |
| - | `doc_type` | Set to `'law'` |
| - | `lifecycle_stage` | Set to `'law'` |

### Skip Linking (Deferred)
SFS documents do not have `dokreferens` linking to propositions. This will be addressed in Phase 5.5 using:
1. Title parsing: "Lag om ändring i [proposition]"
2. Reverse lookup: Find betänkande with matching riksdagsskrivelse

### Metadata Fields
Store in `metadata` JSONB:
```json
{
  "sfs_number": "2024:1000",
  "upphavd": "2025-05-01",  // If repealed
  "upphnr": "SFS 2025:219"  // Repealing law
}
```

---

## Phase 5.4.3: Admin UI

### Scraper Controls
Add to `AdminScraper.tsx`:
- "Scrape Committee Reports" button (session selector: 2024/25, 2023/24, etc.)
- "Scrape Laws" button (year selector: 2024, 2023, etc.)
- Batch size control (default: 50)

### Test Component
Create `CommitteeReportsScraperTest.tsx`:
- Single session test (10 docs)
- Full session scrape
- Display: docs created, refs created, errors

---

## Database Changes

### New doc_type Values
No migration needed — `doc_type` is a TEXT column without CHECK constraint.

New values to use:
- `'committee_report'` — Betänkande
- `'law'` — SFS

### lifecycle_stage Values
Already supports needed values. Add if missing:
- `'parliament'` — For betänkanden (legislative process stage)
- `'law'` — For enacted laws

---

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `supabase/functions/scrape-committee-reports/index.ts` | Committee reports scraper |
| `supabase/functions/scrape-laws/index.ts` | Laws scraper |
| `src/components/admin/CommitteeReportsScraperTest.tsx` | Admin test UI |

### Modified Files
| File | Change |
|------|--------|
| `supabase/config.toml` | Add verify_jwt entries for new functions |
| `src/pages/AdminScraper.tsx` | Add scraper test tabs |
| `docs/development/branches/phase-5.4-committee-reports-laws.md` | Update with validation findings |

---

## Implementation Order

1. **Committee Reports Scraper** (1-2 hours)
   - Core listing + detail fetch logic
   - Document insertion with deduplication
   - Cross-reference extraction
   - Timeline event creation

2. **Laws Scraper** (1 hour)
   - Core listing logic
   - Text extraction
   - Document insertion

3. **Admin UI** (30 min)
   - Test components for both scrapers
   - Integration into AdminScraper tabs

4. **Pilot Validation** (30 min)
   - Scrape 10 betänkanden from 2024/25
   - Scrape 10 laws from 2024
   - Verify cross-references created
   - Verify timeline events created

---

## Success Criteria

- [ ] 50+ committee reports ingested from 2024/25 session
- [ ] 50+ laws ingested from 2024
- [ ] Betänkande → Proposition references created (`reference_type = 'recommends'`)
- [ ] Timeline events created for parliament decisions
- [ ] PDF URLs extracted for betänkanden
- [ ] Text content stored for laws
- [ ] No duplicate documents on re-scrape

---

## Technical Notes

### API Response Structure
The `dokumentlista` response returns documents with basic metadata. To get:
- `dokreferens` (cross-references): Must call `dokumentstatus/{dok_id}.json`
- `dokaktivitet` (timeline): Must call `dokumentstatus/{dok_id}.json`
- `dokbilaga` (PDFs): Must call `dokumentstatus/{dok_id}.json`

**Implication**: Each betänkande requires 2 API calls (list + detail). Budget ~3-4 calls/second with 500ms delay.

### Error Recovery
Implement cursor-based resumption:
```javascript
// Track last successfully processed dok_id
// On resume, skip already-inserted documents
```

### Existing Code Patterns
Follow patterns from `scrape-proposition-index/index.ts`:
- CORS headers from `_shared/http-utils.ts`
- Error response format
- Pagination handling
