# Context Priority

**Last Updated:** 2026-02-10  
**Current Phase:** 6.1/6.2 (Riksdagen API Migration) — IN PROGRESS

---

## Purpose

This is a **"read first"** list for Codex (or anyone) refreshing context on the project. It reflects *current relevance* to active development, not full repo coverage.

Maintained by: **Lovable (Architectural Authority)**

---

## Priority Docs (Read in Order)

| # | File | Why It's Priority |
|---|------|-------------------|
| 1 | `docs/WORKFLOW.md` | Operating agreement: roles, phases, message discipline |
| 2 | `docs/PHASE_DELTAS.md` | Most recent changes since last sync |
| 3 | `docs/development/branches/phase-6-riksdagen-api-migration.md` | **IN PROGRESS** - Propositions & Directives migration to riksdagen.se API |
| 4 | `docs/development/RIKSDAGEN_API_RESEARCH.md` | API patterns, field mappings, rate limiting guidance |
| 5 | `docs/development/SCRAPER_KNOWN_ISSUES.md` | Connection reset handling, retry strategies |
| 6 | `docs/development/branches/phase-5.6-content-insights.md` | **COMPLETE** - Remissvar content extraction + stance detection |
| 7 | `docs/CHECKLISTS.md` | Verification requirements before sign-off |
| 8 | `docs/DECISION_LOG.md` | Approved decisions with triple sign-off |
| 9 | `docs/development/PRODUCT_ROADMAP.md` | Overall progress and metrics |

---

## Recent Changes (2026-02-10)

- **COMPLETE:** Admin UI Phase A cleanup — 9 tabs → 6 workflow-based tabs (Dashboard, Scraping, Extraction, Agents, Monitoring, System)
- **COMPLETE:** 10 legacy components archived to `src/components/admin/_archive/`
- **COMPLETE:** Run-order guidance cards added to each workflow tab
- **COMPLETE:** Committee report PDF extraction pipeline verified (3 pilot docs)
- **IN PROGRESS:** Phase 6.1/6.2 Riksdagen API migration (pilots complete, backfill pending)
- **KNOWN ISSUE:** HC01FiU1 (Statens budget) download timeout — large PDF exceeds 30s limit

---

## Phase 6 Status

| Component | Status | Notes |
|-----------|--------|-------|
| 6.1 Propositions Scraper | ✅ PILOT COMPLETE | 10 docs ingested, cross-refs extracted |
| 6.2 Directives Scraper | ✅ PILOT COMPLETE | 10 docs ingested, kommittébeteckning fixed |
| 6.1 Admin UI | ✅ COMPLETE | PropositionRiksdagenScraperTest.tsx |
| 6.2 Admin UI | ✅ COMPLETE | DirectiveRiksdagenScraperTest.tsx |
| Committee Report Extraction | ✅ PILOT COMPLETE | 3 docs extracted (129, 48, 144 pages) |
| Historical Backfill Props | 🔲 PENDING | 31,598 total available |
| Historical Backfill Dirs | 🔲 PENDING | 6,361 total available |
| Freshness Integration | 🔲 PENDING | 7-day dual-source verification |

### Current Database Metrics (verified 2026-01-30)

| Metric | Count |
|--------|-------|
| Propositions (riksdagen source) | 10 |
| Directives (riksdagen source) | 10 |
| Committee reports with extracted text | 3 |
| Cross-references extracted | 6 |

---

## Phase 5.6 Status (COMPLETE)

| Component | Status | Notes |
|-----------|--------|-------|
| 5.6.1 Schema | ✅ COMPLETE | extraction_status, raw_content, extracted_at |
| 5.6.2 Extraction Pipeline | ✅ COMPLETE | 3,366 ok, 55 errors (scanned PDFs) |
| 5.6.3 Stance Detection | ✅ COMPLETE | 3,363 analyzed (keyword-based) |
| 5.6.4 AI Classification | ✅ COMPLETE | Medium auto-approved + no_position flagging |

---

## Known Limitations

### Riksdagen API Connection Resets
- **Issue:** `Connection reset by peer (os error 104)` occurs intermittently
- **Mitigation:** 5 retries with exponential backoff (3s→48s total)
- **Resolution:** Wait 30-60 seconds, retry (scrapers are idempotent)
- **Reference:** `docs/development/SCRAPER_KNOWN_ISSUES.md` Issue #4

### Scanned PDF Extraction (8 documents)
- **Cause:** Image-based PDFs without text layer
- **Resolution:** Future OCR capability
- **Impact:** 0.2% error rate, acceptable

---

## Next Steps

1. **Historical backfill:** Ingest 2024/25 propositions (full session)
2. **Historical backfill:** Ingest 2024 directives (full year)
3. **Older session test:** Verify kommittébeteckning extraction on pre-2015 directives
4. **Phase 6.3:** SOU hybrid pipeline (riksdagen + regeringen)
5. **Phase 7:** Relationship Inference & Case Reconstruction

---

## Secondary Context (If Needed)

- `docs/development/branches/phase-5.4-committee-reports-laws.md` — Committee Reports + Laws (research complete)
- `docs/development/branches/phase-6-advanced-analysis.md` — Future analytics planning
- `docs/testing/README.md` — Test philosophy and patterns
- `docs/operations/AGENT_RUNBOOK.md` — Agent operational procedures

---

## Update Policy

This list is updated when:
- Governance docs change (WORKFLOW, CHECKLISTS, DECISION_LOG)
- Phase transitions occur (new branch doc becomes active)
- Critical implementation docs are created or deprecated

Updates are noted in `docs/PHASE_DELTAS.md`.
