# Phase 5.4: Committee Reports + Laws

**Status:** 🚧 IN PROGRESS — Scrapers Implemented, Ready for Pilot  
**Branch:** `phase-5.4-committee-reports-laws`  
**Dependencies:** Phase 5.3 (Remisser + Remissvar), Phase 5.6 (Content Insights)

## Implementation Progress (2026-01-28)

- ✅ `scrape-committee-reports` edge function created
- ✅ `scrape-laws` edge function created  
- ✅ Admin UI components added (Parliament tab)
- ⏳ Pilot validation pending (10 betänkanden + 10 laws)

---

### riksdagen.se Open Data API

The Swedish Parliament provides a comprehensive REST API for accessing legislative documents.

**Base URL:** `https://data.riksdagen.se/`

**Key Endpoints:**
- Document list: `https://data.riksdagen.se/dokumentlista/?doktyp={type}&rm={session}&utformat=json`
- Single document (raw content formats): `https://data.riksdagen.se/dokument/{dok_id}.text` / `.html` / `.json`
- Document status (enriched metadata + refs + attachments): `https://data.riksdagen.se/dokumentstatus/{dok_id}.json`

**Formats:** JSON, XML, CSV, HTML, text

---

## Document Types

### Committee Reports (Betänkanden)

**Query:** `doktyp=bet`

**Sample Response Fields:**
```json
{
  "dok_id": "HC01SkU18",
  "titel": "Godkännande för F-skatt - nya hinder och återkallelsegrunder",
  "rm": "2024/25",
  "organ": "SkU",
  "beteckning": "SkU18",
  "datum": "2025-06-16",
  "summary": "Regeringen vill införa nya regler...",
  "filbilaga": {
    "fil": [{
      "typ": "pdf",
      "namn": "2024_25_SkU18_*.pdf",
      "url": "https://data.riksdagen.se/fil/{guid}"
    }]
  },
  "debattdag": "2025-09-17",
  "beslutsdag": "2025-09-17",
  "justeringsdag": "2025-06-12",
  "dokreferens": {
    "referens": [...]
  }
}
```

**Volume (2024/25 session):** 333 documents across 17 pages

**Committee codes (organ):**
- SkU = Skatteutskottet (Tax)
- FiU = Finansutskottet (Finance)
- JuU = Justitieutskottet (Justice)
- SoU = Socialutskottet (Social Affairs)
- MJU = Miljö- och jordbruksutskottet (Environment/Agriculture)
- etc.

### Laws (SFS - Svensk Författningssamling)

**Query:** `doktyp=sfs`

**Sample Response Fields:**
```json
{
  "dok_id": "sfs-2024-1373",
  "titel": "Tillkännagivande (2024:1373) av uppgift om Riksbankens referensränta",
  "rm": "2024",
  "organ": "Riksbanken",
  "beteckning": "2024:1373",
  "dokument_url_text": "//data.riksdagen.se/dokument/sfs-2024-1373.text",
  "dokument_url_html": "//data.riksdagen.se/dokument/sfs-2024-1373.html"
}
```

**Volume (2024):** 161 documents across 9 pages

---

## Pagination

**Parameters:**
- `p={page}` — Page number (1-indexed)
- `sz={size}` — Page size (default 20, max appears to be 100)

**Response includes:**
- `@traffar` — Total hits
- `@sidor` — Total pages
- `@nasta_sida` — Next page URL

---

## Implementation Plan

### Phase 5.4.1: Committee Reports Scraper

1. Create `scrape-committee-reports/index.ts` edge function
2. Fetch from `data.riksdagen.se/dokumentlista/?doktyp=bet&rm={session}&utformat=json`
3. Parse response and insert into `documents` table:
   - `doc_type = 'committee_report'`
   - `doc_number = dok_id` (e.g., "HC01SkU18")
   - `lifecycle_stage = 'parliament'`
4. Extract PDF URLs from `dokumentstatus.dokbilaga.bilaga[].fil_url`
5. Store `dokreferens` for linking to propositions

### Phase 5.4.2: Laws Scraper

1. Create `scrape-laws/index.ts` edge function
2. Fetch from `data.riksdagen.se/dokumentlista/?doktyp=sfs&rm={year}&utformat=json`
3. Parse response and insert into `documents` table:
   - `doc_type = 'law'`
   - `doc_number = beteckning` (e.g., "2024:1373")
   - `lifecycle_stage = 'law'`
4. Text content available directly via `dokument_url_text`

### Phase 5.4.3: Cross-Linking

1. Parse `dokreferens` from committee reports to link to propositions
2. Create `document_references` entries:
   - `reference_type = 'recommends'` (betänkande → proposition)
   - `reference_type = 'enacts'` (law → proposition)
3. Timeline events:
   - `law_enacted` with date from `datum`

---

## Database Schema Changes

### No new tables required

Use existing:
- `documents` (with `doc_type = 'committee_report'` or `'law'`)
- `document_references` (for linking)
- `timeline_events` (for `law_enacted`)

### lifecycle_stage Values

Extend allowed values:
```sql
-- If CHECK constraint exists, alter it
ALTER TABLE documents 
  DROP CONSTRAINT IF EXISTS documents_lifecycle_stage_check,
  ADD CONSTRAINT documents_lifecycle_stage_check 
  CHECK (lifecycle_stage IN ('directive', 'interim_analysis', 'sou', 'remiss', 'proposition', 'parliament', 'law'));
```

---

## Success Criteria

- [ ] 50+ committee reports scraped (pilot on 2024/25 session)
- [ ] 50+ laws scraped (pilot on 2024)
- [ ] PDF extraction working for committee reports
- [ ] `dokreferens` parsed for proposition links
- [ ] `document_references` created for parliament→proposition links
- [ ] Timeline events created for `law_enacted`

---

## Known Considerations

### Rate Limiting
- API appears to have no strict rate limit, but implement 500ms delay between requests

### Intermittent Connection Resets (Backend Functions)

The API occasionally closes connections with `Connection reset by peer (os error 104)` when called from backend functions.

Mitigations:
- Browser-like request headers (`User-Agent`, `Accept`, `Accept-Language`)
- Increased retries with exponential backoff + jitter
- Treat as upstream availability (`503 upstream_unavailable`) to encourage retry

### Document IDs
- `dok_id` format varies: `HC01SkU18` (committee) vs `sfs-2024-1373` (laws)
- Use full `dok_id` as unique identifier

### Session Format
- Committee reports use riksmöte: `2024/25`
- Laws use calendar year: `2024`

---

## Related Documentation

- [Phase 5.3: Remisser](./phase-5.3-remisser-remissvar.md) — Complete
- [Phase 5.5: Cross-Document Insights](./phase-5.5-cross-document-insights.md) — Complete
- [Phase 5.6: Content Insights](./phase-5.6-content-insights.md) — In Progress
- [riksdagen.se API Documentation](https://www.riksdagen.se/sv/dokument-och-lagar/riksdagens-oppna-data/anvandarstod/om-apiet/)
