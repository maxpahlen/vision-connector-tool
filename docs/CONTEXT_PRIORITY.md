# Context Priority

**Last Updated:** 2026-02-13  
**Current Phase:** 7 — Advanced Insights & Semantic Intelligence
**Active Slice:** 7.1 Stakeholder Influence Analytics (Wave 1)

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
| 3 | `docs/development/branches/phase-7-advanced-insights.md` | **ACTIVE** - Slice details, schemas, execution plan |
| 4 | `docs/development/branches/phase-6-relationship-inference.md` | **COMPLETE** - Deterministic graph, reference resolution |
| 5 | `docs/development/PRODUCT_ROADMAP.md` | Overall progress and metrics |
| 6 | `docs/CHECKLISTS.md` | Verification requirements before sign-off |
| 7 | `docs/DECISION_LOG.md` | Approved decisions with triple sign-off |
| 8 | `docs/development/SCRAPER_KNOWN_ISSUES.md` | Connection reset handling, retry strategies |

---

## Recent Changes (2026-02-13)

- **COMPLETE:** Phase 6 — All slices closed (6A.1–6A.5, 6B.1)
- **APPROVED:** Phase 7 roadmap — 7 slices, 3 waves
- **ACTIVE:** Slice 7.1 — Stakeholder Influence Analytics (DB schema + edge function)
- **ARCHIVED:** `phase-6-advanced-analysis.md` → superseded by Phase 7 plan

---

## Phase 7 Status

| Slice | Status | Notes |
|-------|--------|-------|
| 7.1 Stakeholder Influence | 🔄 IN PROGRESS | DB schema + edge function |
| 7.2 Summarizer + Embeddings | 🔲 PENDING | Blocked on embedding model decision |
| 7.3 Semantic Link Engine | 🔲 PENDING | Depends on 7.2 |
| 7.4 Entity Co-Occurrence | 🔲 PENDING | Wave 1 (parallel with 7.1) |
| 7.5 Legislative Trends | 🔲 PENDING | Wave 2 |
| 7.6 Motions Ingestion | ⏸️ GATED | Requires product decision |
| 7.7 Prediction Engine | ⏸️ GATED | After 7.1 + 7.5 |

### Current Database Metrics (verified 2026-02-13)

| Metric | Count |
|--------|-------|
| Total documents | 6,790 |
| Documents in processes | 3,151 (46.4%) |
| Total processes | 4,456 |
| Document relationships | 2,791 |
| Resolved references | 3,460 / 7,441 (46.5%) |
| Entities | 1,780 |
| Remissvar | 3,421 |

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

1. **7.1:** Stakeholder Influence Analytics — DB schema + edge function + dashboard
2. **7.2:** Summarizer Agent + Embeddings (after embedding model decision)
3. **7.4:** Entity Co-Occurrence Networks (Wave 1, parallel)
4. **Phase 8:** Grounded Conversational Intelligence (future, after Phase 7)

---

## Secondary Context (If Needed)

- `docs/development/branches/phase-6-riksdagen-api-migration.md` — Corpus backfill context
- `docs/development/SEMANTIC_LINK_AGENT_PLAN.md` — Detailed plan for Slice 7.3
- `docs/testing/README.md` — Test philosophy and patterns
- `docs/operations/AGENT_RUNBOOK.md` — Agent operational procedures

## Future Context (Not Active)

- Phase 8: Grounded Conversational Intelligence — see `PRODUCT_ROADMAP.md` Phase 8 section and `phase-7-advanced-insights.md` alignment note

---

## Update Policy

This list is updated when:
- Governance docs change (WORKFLOW, CHECKLISTS, DECISION_LOG)
- Phase transitions occur (new branch doc becomes active)
- Critical implementation docs are created or deprecated

Updates are noted in `docs/PHASE_DELTAS.md`.
