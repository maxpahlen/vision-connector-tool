

# Phase 6.1 Execution Plan: Riksdagen API Historical Backfill

## Executive Summary

Complete the `phase-6-riksdagen-api-migration` branch by executing historical backfill for propositions and directives, then batch committee report text extraction. This is the DATA FOUNDATION step — without it, the relationship inference agent (next branch) has too little data to build meaningful legislative cases.

## Completion Criteria for `phase-6-riksdagen-api-migration`

To mark this branch as COMPLETE, all 5 remaining items must be addressed:

| Item | Action | Priority |
|------|--------|----------|
| Proposition backfill (recent) | Sessions 2020/21 through 2024/25 | P0 |
| Directive backfill (recent) | Sessions 2010 through 2025 | P0 |
| Committee report text extraction | 330 remaining PDFs | P1 |
| Deep historical backfill | Pre-2010 props, pre-2010 dirs | P2 (defer or scope-reduce) |
| Freshness integration | 7-day dual-source check | P2 (defer to operational phase) |

### Recommended Scope Decision

**Mark branch COMPLETE after P0 + P1.** Deep historical (pre-2010) and freshness integration are operational enhancements, not foundational. They can be tracked as follow-up tasks without blocking Phase 6.2 (relationship inference).

## Backfill Execution Plan

### Propositions (P0)

**Target sessions:** 2020/21 through 2024/25 (5 recent sessions)

- Expected volume: ~1,000-1,200 documents (roughly 200-240 per session)
- Already ingested: 126 (mostly 2024/25)
- Batch size per edge function call: 20 documents (with 500ms inter-request delay)
- Pages per session: ~12 pages at sz=20
- Estimated API calls per session: ~12 list + ~240 detail = ~252
- Rate limiting: 500ms delay = ~2 minutes per page of 20

**Execution approach:**
- Run session-by-session via Admin UI (`PropositionRiksdagenScraperTest`)
- Start with 2023/24 (most recent not yet backfilled)
- Work backwards: 2022/23, 2021/22, 2020/21
- Dedup handles overlap with existing 126 docs automatically

### Directives (P0)

**Target sessions:** 2015 through 2025 (10 recent years)

- Expected volume: ~800-1,000 documents
- Already ingested: 183
- Same batch pattern as propositions
- Smaller per-session counts (~80-130 per year)

**Execution approach:**
- Run year-by-year via Admin UI (`DirectiveRiksdagenScraperTest`)
- Start with 2023, work backwards
- Dedup handles overlap automatically

### Committee Report Text Extraction (P1)

- 330 PDFs remaining (3 pilot complete)
- Uses existing `process-committee-report-pdf` edge function
- Batch via Admin UI (`CommitteeReportTextExtractor`)
- Rate: ~10-20 per batch (PDF extraction is slower)

## What Lovable Should Execute

1. **No new edge functions needed** — scrapers already exist and are pilot-validated
2. **No schema changes** — existing tables handle all data
3. **Admin UI already supports batch execution** — no UI changes needed
4. **Documentation updates only:**
   - Update `phase-6-riksdagen-api-migration.md` status and metrics after each batch
   - Update `PRODUCT_ROADMAP.md` counts after backfill complete

## Sequencing After This Branch

```text
phase-6-riksdagen-api-migration (NOW)
  |  Complete backfill, mark COMPLETE
  v
phase-6-relationship-inference (NEXT)
  |  Case reconstruction agent, legislative_cases table
  |  Needs: large corpus of props + dirs + committee reports
  v
phase-6-advanced-analysis (LATER)
  |  Sentiment, impact, trends
  |  Needs: cases + relationships to analyze
```

`phase-6-advanced-analysis` is NOT the logical next step after migration. `phase-6-relationship-inference` is, because:
- It builds on the data foundation (more docs = better case matching)
- It creates the `legislative_cases` structure that advanced analysis operates on
- It is the roadmap-defined Phase 6 goal (blackboard agent, case reconstruction)

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Edge function timeouts on large batches | Keep batch size at 20; paginate manually |
| API rate limiting during sustained backfill | 500ms delay already validated; monitor for 429s |
| Duplicate documents | Dedup by doc_number already implemented |
| Committee report PDF extraction failures | Track error rate; accept same 1.6% OCR limit |

## Decision Required from Max

1. **Agree with P0+P1 scope** (recent sessions + committee extraction) as completion criteria, deferring deep historical and freshness to follow-up tasks?
2. **Agree with sequencing**: migration -> relationship inference -> advanced analysis?
3. **Should Lovable begin the backfill execution now**, or should we first create a formal branch plan update and get triple sign-off?

## Technical Details

### Existing Edge Functions (no changes needed)

- `scrape-propositions-riksdagen` — paginated ingestion, dedup, cross-refs
- `scrape-directives-riksdagen` — paginated ingestion, dedup, kommittebeteckning
- `process-committee-report-pdf` — PDF extraction via Vercel service

### Admin UI Components (no changes needed)

- `PropositionRiksdagenScraperTest.tsx` — session selector, page/limit controls
- `DirectiveRiksdagenScraperTest.tsx` — same pattern
- `CommitteeReportTextExtractor.tsx` — batch extraction controls

### Monitoring

- Track ingestion counts after each session batch
- Compare against expected API totals
- Monitor for error rate spikes

