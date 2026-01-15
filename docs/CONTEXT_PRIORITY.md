# Context Priority

**Last Updated:** 2026-01-15  
**Current Phase:** 5.3 (Remisser + Remissvar) — ✅ COMPLETE

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
| 3 | `docs/development/ENTITY_DEDUPLICATION_PLAN.md` | Just completed - entity quality improvements |
| 4 | `docs/development/branches/phase-5.3-remisser-remissvar.md` | Phase 5.3 summary (complete) |
| 5 | `docs/CHECKLISTS.md` | Verification requirements before sign-off |
| 6 | `docs/DECISION_LOG.md` | Approved decisions with triple sign-off |
| 7 | `docs/development/PRODUCT_ROADMAP.md` | Overall progress and metrics |

---

## Recent Changes (2026-01-15)

- **COMPLETE:** Entity deduplication plan executed
- **COMPLETE:** Possessive 's' stripping fix deployed (40+ exceptions)
- **COMPLETE:** 17 truncated entities repaired
- **COMPLETE:** 4,321 invitees linked to entities (100%)
- **COMPLETE:** Phase 5.3 Remisser + Remissvar fully operational

---

## Phase 5.3 Final Status

| Component | Status |
|-----------|--------|
| Remiss index scraping | ✅ 54 matched |
| Process remiss pages | ✅ 3,424 remissvar |
| Parse remissinstanser PDFs | ✅ 4,321 invitees |
| Bootstrap org entities | ✅ 1,473 entities |
| Link remissvar to entities | ✅ 99.91% |
| Link invitees to entities | ✅ 100% |
| Entity quality fixes | ✅ 0 duplicates, 0 truncated |

---

## Next Steps

1. **Phase 5.4:** Committee Reports + Laws ingestion
2. **Phase 6:** Relationship Inference & Case Reconstruction
3. **Optional:** Add unique constraint on entities.name_lower

---

## Secondary Context (If Needed)

- `docs/development/SCRAPER_KNOWN_ISSUES.md` — Pagination quirks, Filter API notes
- `docs/testing/README.md` — Test philosophy and patterns
- `docs/operations/AGENT_RUNBOOK.md` — Agent operational procedures

---

## Update Policy

This list is updated when:
- Governance docs change (WORKFLOW, CHECKLISTS, DECISION_LOG)
- Phase transitions occur (new branch doc becomes active)
- Critical implementation docs are created or deprecated

Updates are noted in `docs/PHASE_DELTAS.md`.
