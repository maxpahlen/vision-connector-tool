# Branch Plan: Phase 6 — Riksdagen API Migration

## Branch Information
- **Branch Name**: `phase-6-riksdagen-api-migration`
- **Created**: 2026-01-28
- **Status**: IN PROGRESS — Pilots Complete
- **Last Updated**: 2026-01-30
- **Depends On**: Phase 5.4 completion (Committee Reports & Laws)

## Goal

Migrate Propositions and Directives ingestion from the fragile regeringen.se Filter API to the structured riksdagen.se Open Data API, achieving 10-100x corpus expansion with cleaner, more reliable data pipelines.

---

## Implementation Status

### Completed ✅

| Component | Date | Details |
|-----------|------|---------|
| Propositions Scraper | 2026-01-29 | `scrape-propositions-riksdagen` edge function |
| Directives Scraper | 2026-01-29 | `scrape-directives-riksdagen` edge function |
| Propositions Pilot | 2026-01-29 | 10 docs ingested, cross-refs extracted |
| Directives Pilot | 2026-01-29 | 10 docs ingested, 2020 session tested |
| Propositions Admin UI | 2026-01-29 | `PropositionRiksdagenScraperTest.tsx` |
| Directives Admin UI | 2026-01-29 | `DirectiveRiksdagenScraperTest.tsx` |
| Kommittébeteckning Fix | 2026-01-30 | Fallback chain: tempbeteckning → dokuppgift → subtitel |
| Committee Report Extraction | 2026-01-30 | 3 pilot docs (129, 48, 144 pages) |

### In Progress 🔄

| Component | Notes |
|-----------|-------|
| Historical Backfill Props | 31,598 available, 10 ingested |
| Historical Backfill Dirs | 6,361 available, 10 ingested |
| Batch Committee Extraction | 330 remaining (3 pilot complete) |

### Pending 🔲

| Component | Notes |
|-----------|-------|
| Freshness Integration | 7-day dual-source verification |
| Deep Historical Backfill | 1971-2010 props, 1988-2010 dirs |

---

## Scope

### In Scope
- **Propositions Migration**: New `scrape-propositions-riksdagen` edge function
- **Directives Migration**: New `scrape-directives-riksdagen` edge function  
- **Cross-reference Extraction**: Extract `dokreferens` links to related documents
- **Timeline Event Generation**: Extract `dokaktivitet` for legislative timeline
- **Historical Backfill**: Ingest documents from 1971 (props) / 1988 (dirs) onward
- **Freshness Check**: Dual-source verification for latest-week documents

### Out of Scope
- SOU hybrid pipeline (Phase 6.2)
- Remiss ecosystem changes (remains on regeringen.se)
- DS document type addition (Phase 6.3)
- Voting records integration (Phase 7)

---

## Success Criteria

- [ ] Propositions: Ingest 31,598 documents (vs current ~10)
- [ ] Directives: Ingest 6,361 documents (vs current ~56)
- [ ] Cross-references: Extract proposition→betänkande links via `dokreferens`
- [ ] Timeline events: Generate events from `dokaktivitet` data
- [ ] No duplicate documents (dedup by `doc_number`)
- [ ] API resilience: Handle connection resets with exponential backoff
- [ ] Freshness: Documents from last 7 days verified against regeringen.se

---

## Technical Approach

### API Endpoints

**Propositions:**
```
GET https://data.riksdagen.se/dokumentlista/?doktyp=prop&rm={session}&utformat=json&p={page}&sz=100
```

**Directives:**
```
GET https://data.riksdagen.se/dokumentlista/?doktyp=dir&rm={session}&utformat=json&p={page}&sz=100
```

**Document Detail (for text + references):**
```
GET https://data.riksdagen.se/dokumentstatus/{doc_id}.json
```

**Text Content:**
```
GET https://data.riksdagen.se/dokument/{doc_id}.text
```

### Key Data Mappings

| riksdagen.se Field | Our Schema | Notes |
|-------------------|------------|-------|
| `dok_id` | `metadata.riksdagen_id` | Unique identifier |
| `rm` | `metadata.session` | Parliamentary session |
| `beteckning` | `doc_number` | e.g., "2024/25:1" |
| `titel` | `title` | Document title |
| `organ` | `ministry` | Responsible ministry/committee |
| `datum` | `publication_date` | Publication date |
| `dokument_url_text` | Text extraction | Direct text URL |
| `filbilaga[].fil.url` | `pdf_url` | PDF attachment |
| `dokreferens` | `document_references` | Cross-doc links |
| `dokaktivitet` | `timeline_events` | Activity history |

### Resilience Pattern

Apply proven pattern from Phase 5.4:
```typescript
const headers = {
  'User-Agent': 'Lagstiftningsbevakning/1.0 (lovable.dev; contact@lovable.dev)',
  'Accept': 'application/json',
  'Connection': 'keep-alive'
};

// Base delay between requests: 500ms (validated for scale)
const REQUEST_DELAY_MS = 500;

// Exponential backoff with jitter on failures
const backoff = 3000 * Math.pow(2, attempt) + Math.random() * 1000;
```

**Rate Limiting Rationale**: 500ms base delay prevents throttling at scale (31k+ documents). The 100ms delay mentioned in early drafts was too aggressive for sustained batch processing.

---

### Freshness & Conflict Resolution Policy

**7-Day Freshness Window**: Documents published within the last 7 days require dual-source verification because riksdagen.se may have archival lag.

**Conflict Resolution Rules**:
1. **Metadata conflicts**: Prefer riksdagen.se as source of truth (structured, validated)
2. **Missing from riksdagen**: Use regeringen.se as fallback, tag with `metadata.source = 'regeringen'`
3. **Both sources present**: Use riksdagen.se data, log regeringen.se discrepancies for investigation
4. **Text content**: Prefer riksdagen.se native text; fall back to PDF extraction if unavailable

---

### Doc Number Matching Strategy

**Normalization Rules** (for cross-source matching and future SOU linkage):
```
Prop. 2024/25:1   → prop-2024/25-1
SOU 2024:01      → sou-2024-1
SOU 2024:1       → sou-2024-1  (same canonical form)
Dir. 2024:10     → dir-2024-10
```

**Match Metrics**: Track `match_success_rate` during ingestion. Target: >99% for props/dirs.

---

## Implementation Plan

### Phase 6.1: Propositions Migration — ✅ PILOT COMPLETE

**Step 1: Create scraper edge function** ✅
- File: `supabase/functions/scrape-propositions-riksdagen/index.ts`
- Paginated ingestion from riksdagen.se API
- Extract metadata, cross-references (dokreferens)
- Dedup by `doc_number`

**Step 2: Pilot validation** ✅
- 10 propositions ingested from 2024/25 session
- Cross-references extracted (6 total)
- Admin UI operational

**Step 3: Historical backfill** 🔲 PENDING
- Batch process by session (2024/25, 2023/24, ...)
- Rate limit: 500ms between requests
- Target: All 31,598 propositions

**Step 4: Freshness integration** 🔲 PENDING
- For documents < 7 days old, cross-check against regeringen.se
- Log any discrepancies for investigation

### Phase 6.2: Directives Migration — ✅ PILOT COMPLETE

**Step 1: Create scraper edge function** ✅
- File: `supabase/functions/scrape-directives-riksdagen/index.ts`
- Extract kommittébeteckning for SOU linkage
- Similar pattern to propositions scraper

**Step 2: Pilot validation** ✅
- 10 directives ingested
- 2020 session tested for kommittébeteckning extraction
- 5/5 tilläggsdirektiv correctly extracted designations

**Step 3: Kommittébeteckning fix** ✅ (2026-01-30)
- **Root cause**: API stores designation in `tempbeteckning`, not `dokuppgift`
- **Solution**: Fallback chain implemented:
  1. `tempbeteckning` field (primary)
  2. `dokuppgift.kommittebeteckning` 
  3. Regex parse from `subtitel`

**Step 4: Historical backfill** 🔲 PENDING
- Target: All 6,361 directives from 1988

### Phase 6.3: Committee Report Extraction — ✅ PILOT COMPLETE

**Pipeline**: Riksdagen PDF URL → PDF Extractor (Vercel) → Database

**Pilot results** (2026-01-30):

| Document | Pages | Characters | Status |
|----------|-------|------------|--------|
| HC01MJU14 | 129 | 355,004 | ✅ ok |
| HC01JuU10 | 48 | 106,032 | ✅ ok |
| HC01FöU4 | 144 | 399,392 | ✅ ok |

**Prerequisite**: PDF extractor redeployed with `data.riksdagen.se` in allowlist

**Remaining**: 330 committee reports pending batch extraction

---

## Admin UI Updates

### New Test Components

1. **PropositionRiksdagenScraperTest.tsx**
   - Session selector (dropdown)
   - Page/limit controls
   - Results display with cross-references
   - Progress indicator for batch processing

2. **DirectiveRiksdagenScraperTest.tsx**
   - Similar structure
   - Show kommittébeteckning extraction

### Migration Dashboard

- Side-by-side comparison: regeringen.se count vs riksdagen.se count
- Progress bars for historical backfill
- Quality metrics: match rate, reference extraction rate

---

## Testing Strategy

### Unit Tests
- API response parsing
- Document mapping functions
- Deduplication logic

### Integration Tests
- End-to-end ingestion of single document
- Cross-reference creation
- Timeline event generation

### Pilot Protocol
Following established "pilot then scale" strategy:
1. Select 3 representative documents per type
2. Run full pipeline
3. Validate: ≥1 timeline event, ≥1 cross-reference per doc
4. Resolve issues before batch processing

---

## Data Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Dedup accuracy | 100% | No duplicate doc_numbers |
| Cross-ref extraction | >90% | References found / expected |
| Timeline generation | >80% | Events created / dokaktivitet entries |
| Text extraction | >95% | Documents with raw_content |
| API success rate | >99% | Successful requests / total |

---

## Rollback Plan

1. Keep existing regeringen.se scrapers operational during migration
2. New scrapers insert with `metadata.source = 'riksdagen'`
3. If issues arise, can filter by source and delete riksdagen-sourced docs
4. Revert to regeringen.se scrapers if needed

---

## Timeline

| Week | Milestone | Status |
|------|-----------|--------|
| 1 | Create proposition scraper, pilot 3 docs | ✅ COMPLETE (10 docs) |
| 1 | Create directive scraper, pilot 3 docs | ✅ COMPLETE (10 docs) |
| 2 | Kommittébeteckning extraction fix | ✅ COMPLETE |
| 2 | Committee report PDF extraction pilot | ✅ COMPLETE (3 docs) |
| 3 | Proposition historical backfill (2020-2026) | 🔲 PENDING |
| 3 | Directive historical backfill (2010-2026) | 🔲 PENDING |
| 4 | Batch committee report extraction (330 docs) | 🔲 PENDING |
| 5 | Deep historical backfill (1971-2010 props, 1988-2010 dirs) | 🔲 PENDING |
| 6 | Freshness integration, quality metrics dashboard | 🔲 PENDING |

---

## Dependencies

- Phase 5.4 completion (reuse resilience patterns)
- Existing document/reference/timeline schema (no changes needed)
- Admin UI infrastructure (ScraperTest component pattern)

---

## Related Documentation

- `docs/development/RIKSDAGEN_API_RESEARCH.md` — API research and source comparison
- `docs/development/branches/phase-5.4-committee-reports-laws.md` — Resilience patterns
- `docs/testing/phase-5-test-plan.md` — Pilot validation methodology

---

## Notes

- The riksdagen.se API is public and generous with rate limits
- No authentication required
- JSON format preferred over XML for parsing simplicity
- The `dokreferens` field is key for building the legislative graph
- `dokaktivitet` provides rich timeline data (beslut, utskott, etc.)

### Important: Proposition Timeline Events Architecture

**Propositions do NOT have `dokaktivitet` in the Riksdagen API.** This is by design:

- **Propositions** are INPUT documents (Government → Parliament)
- **Committee Reports (Betänkanden)** are OUTPUT documents (Parliament → Plenary)
- The `dokaktivitet` field tracks **parliamentary processing**, which occurs at the committee report level

```
Proposition ──────────────> Parliament ──────────────> Committee Report
(no dokaktivitet)           (receives prop)            (has dokaktivitet)
```

**To display a proposition's timeline**, resolve the `has_committee_report` reference:
```sql
SELECT te.event_type, te.event_date, te.description
FROM document_references dr
JOIN documents bet ON dr.target_doc_number = bet.doc_number
JOIN processes p ON p.main_document_id = bet.id
JOIN timeline_events te ON te.process_id = p.id
WHERE dr.source_document_id = '<proposition_id>'
AND dr.reference_type = 'has_committee_report';
```

**Verified 2026-01-29**: Committee reports contain rich `dokaktivitet` (UBE, JUS, TRY, B, BEH, BES events). Propositions correctly have 0 timeline events from the API; their processing history comes from linked committee reports.

---

## Files Created ✅

- `supabase/functions/scrape-propositions-riksdagen/index.ts` ✅
- `supabase/functions/scrape-directives-riksdagen/index.ts` ✅
- `src/components/admin/PropositionRiksdagenScraperTest.tsx` ✅
- `src/components/admin/DirectiveRiksdagenScraperTest.tsx` ✅

## Files Updated ✅

- `src/pages/AdminScraper.tsx` — Added new test components ✅
- `docs/CONTEXT_PRIORITY.md` — Phase 6 status ✅
- `docs/PHASE_DELTAS.md` — Progress logging ✅
- `docs/development/SCRAPER_KNOWN_ISSUES.md` — Connection reset handling ✅

## Current Database Metrics (2026-01-30)

| Metric | Count |
|--------|-------|
| Propositions (riksdagen source) | 10 |
| Directives (riksdagen source) | 10 |
| Committee reports with extracted text | 3 |
| Cross-references extracted | 6 |
