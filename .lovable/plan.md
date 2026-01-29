
Message Type: EXECUTION UPDATE | Phase: EXECUTION

## Phase 6 Status: Riksdagen API Migration

### Phase 6.1: Propositions ✓ COMPLETE
- **Scraper**: `scrape-propositions-riksdagen` deployed
- **Pilot**: 20 propositions ingested from 3 sessions
- **Cross-refs**: 38 references extracted
- **Timeline events**: 0 (expected - see architecture note in docs)

### Phase 6.2: Directives ✓ PILOT COMPLETE
- **Scraper**: `scrape-directives-riksdagen` deployed
- **Pilot Results**: 10 directives from 3 sessions (2024, 2023, 2022)
  | Session | Inserted | Refs | Kommitté |
  |---------|----------|------|----------|
  | 2024    | 3        | 0    | 0        |
  | 2023    | 3        | 0    | 0        |
  | 2022    | 4        | 0    | 0        |
- **Total Available**: 2024 (127), 2023 (183), 2022 (143) = ~6,361 total
- **Kommittébeteckning**: Not present in recent directives (may be added later when committee is established)

### Key Implementation Details
- **Rate limiting**: 500ms between requests + exponential backoff on failures
- **Deduplication**: By doc_number + doc_type
- **Metadata**: riksdagen_id, session, kommittebeteckning (when available)
- **Lifecycle stage**: "directive" to match schema constraints

### Next Steps
- [ ] Create Admin UI components for both scrapers
- [ ] Start historical backfill (2024 session first)
- [ ] Test with older directives (pre-2020) for kommittébeteckning extraction
- [ ] Update CONTEXT_PRIORITY.md for Codex sync

### Files Created
- `supabase/functions/scrape-directives-riksdagen/index.ts`

### Files Updated
- `supabase/config.toml` - Added directives function config
- `docs/development/branches/phase-6-riksdagen-api-migration.md` - Timeline architecture clarification
