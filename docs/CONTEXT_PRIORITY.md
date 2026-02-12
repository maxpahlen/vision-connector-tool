# Context Priority

**Last Updated:** 2026-02-12  
**Current Phase:** 6A — Relationship Inference (Deterministic Graph)
**Active Slice:** 6A.2 — Corpus backfill (H5–H7+HD committee reports)

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
| 3 | `docs/development/branches/phase-6-relationship-inference.md` | **ACTIVE** - Deterministic graph building, reference resolution |
| 4 | `docs/development/branches/phase-6-riksdagen-api-migration.md` | Corpus backfill context (propositions, directives, committee reports) |
| 4 | `docs/development/RIKSDAGEN_API_RESEARCH.md` | API patterns, field mappings, rate limiting guidance |
| 5 | `docs/development/SCRAPER_KNOWN_ISSUES.md` | Connection reset handling, retry strategies |
| 6 | `docs/archive/branches/phase-5.6-content-insights.md` | **COMPLETE** - Remissvar content extraction + stance detection (archived) |
| 7 | `docs/CHECKLISTS.md` | Verification requirements before sign-off |
| 8 | `docs/DECISION_LOG.md` | Approved decisions with triple sign-off |
| 9 | `docs/development/PRODUCT_ROADMAP.md` | Overall progress and metrics |

---

## Recent Changes (2026-02-12)

- **COMPLETE:** Slice 6A.1 — Deterministic reference resolution (84 → 2,157 resolved, 31.7%)
- **APPROVED:** Motions (Mot.) deferred to Phase 7 — 2,820 refs documented as known gap
- **APPROVED:** Committee report backfill scope: H5–H7 + HD (2017–2026)
- **REJECTED:** Title-matching heuristic — low ROI, high false-positive risk
- **NEXT:** Slice 6A.2 — Backfill committee reports for H5–H7+HD, then re-run resolver

---

## Phase 6 Status

| Component | Status | Notes |
|-----------|--------|-------|
| 6A.1 Reference Resolution | ✅ COMPLETE | 2,157/6,801 resolved (31.7%) |
| 6A.2 Corpus Backfill | 🔲 PENDING | H5–H7+HD committee reports → re-resolve |
| 6A.3 Process Linkage | 🔲 PENDING | ~5,200 orphan docs |
| 6A.4 M2M Schema | 🔲 PENDING | Needs approval |
| 6B.1 AI Inference | 🔲 PENDING | Only for unresolvable-by-rules links |
| Motions (Mot.) | ⏸️ DEFERRED | Phase 7 — 2,820 refs, ~60k docs in API |

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

1. **6A.2 Execution:** Backfill committee reports for sessions H5, H6, H7, HD via `scrape-committee-reports`
2. **6A.2 Re-resolve:** Re-run `resolve-document-references` after corpus expansion
3. **6A.3:** Process linkage for ~5,200 orphan documents (needs approval)
4. **6A.4:** `document_relationships` M2M schema (needs approval)
5. **Phase 7:** Motions ingestion + advanced insights (future)

---

## Secondary Context (If Needed)

- `docs/archive/branches/phase-5.4-committee-reports-laws.md` — Committee Reports + Laws (archived, research complete)
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
