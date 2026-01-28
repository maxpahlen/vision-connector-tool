# Branch Plan: Phase 6 — Riksdagen API Migration

## Branch Information
- **Branch Name**: `phase-6-riksdagen-api-migration`
- **Created**: 2026-01-28
- **Status**: Planning
- **Depends On**: Phase 5.4 completion (Committee Reports & Laws)

## Goal

Migrate Propositions and Directives ingestion from the fragile regeringen.se Filter API to the structured riksdagen.se Open Data API, achieving 10-100x corpus expansion with cleaner, more reliable data pipelines.

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

// Exponential backoff with jitter
const backoff = 3000 * Math.pow(2, attempt) + Math.random() * 1000;
```

---

## Implementation Plan

### Phase 6.1: Propositions Migration

**Step 1: Create scraper edge function**
- File: `supabase/functions/scrape-propositions-riksdagen/index.ts`
- Paginated ingestion from riksdagen.se API
- Extract metadata, cross-references, timeline events
- Dedup by `doc_number`

**Step 2: Pilot validation**
- Select 3 representative propositions (different sessions/ministries)
- Run full pipeline: metadata → text → references → timeline
- Verify data quality and completeness

**Step 3: Historical backfill**
- Batch process by session (2024/25, 2023/24, ...)
- Rate limit: 100ms between requests
- Target: All 31,598 propositions

**Step 4: Freshness integration**
- For documents < 7 days old, cross-check against regeringen.se
- Log any discrepancies for investigation

### Phase 6.2: Directives Migration

**Step 1: Create scraper edge function**
- File: `supabase/functions/scrape-directives-riksdagen/index.ts`
- Extract kommittébeteckning for SOU linkage
- Similar pattern to propositions scraper

**Step 2: Pilot validation**
- 3 representative directives
- Verify kommittébeteckning extraction
- Confirm SOU cross-reference quality

**Step 3: Historical backfill**
- Target: All 6,361 directives from 1988

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

| Week | Milestone |
|------|-----------|
| 1 | Create proposition scraper, pilot 3 docs |
| 2 | Proposition historical backfill (2020-2026) |
| 3 | Create directive scraper, pilot 3 docs |
| 4 | Directive historical backfill (2010-2026) |
| 5 | Deep historical backfill (1971-2010 props, 1988-2010 dirs) |
| 6 | Freshness integration, quality metrics dashboard |

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

---

## Files to Create

- `supabase/functions/scrape-propositions-riksdagen/index.ts`
- `supabase/functions/scrape-directives-riksdagen/index.ts`
- `src/components/admin/PropositionRiksdagenScraperTest.tsx`
- `src/components/admin/DirectiveRiksdagenScraperTest.tsx`

## Files to Update

- `src/pages/AdminScraper.tsx` — Add new test components
- `docs/CONTEXT_PRIORITY.md` — Add Phase 6 docs
