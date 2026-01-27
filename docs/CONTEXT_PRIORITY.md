# Context Priority

**Last Updated:** 2026-01-27  
**Current Phase:** 5.6 (Remissvar Content Insights) — IN PROGRESS

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
| 3 | `docs/development/branches/phase-5.6-content-insights.md` | **IN PROGRESS** - Remissvar content extraction + stance detection |
| 4 | `docs/development/PHASE_5.6_REMISSVAR_TEXT_EXTRACTION_GUIDANCE.md` | Swedish stance keywords, structural anchors from SB PM 2021:1 |
| 5 | `docs/development/branches/phase-5.4-committee-reports-laws.md` | **RESEARCH COMPLETE** - riksdagen.se API patterns documented |
| 6 | `docs/development/branches/phase-5.5-cross-document-insights.md` | **COMPLETE** - Cross-document linking & insights |
| 7 | `docs/CHECKLISTS.md` | Verification requirements before sign-off |
| 8 | `docs/DECISION_LOG.md` | Approved decisions with triple sign-off |
| 9 | `docs/development/PRODUCT_ROADMAP.md` | Overall progress and metrics |

---

## Recent Changes (2026-01-27)

- **COMPLETE:** Phase 5.6.3 keyword-based stance detection deployed + validated
- **IN PROGRESS:** Phase 5.6.4 AI stance classification (paginated accumulation fix deployed)
- **RESEARCH:** Phase 5.4 riksdagen.se API patterns documented for Committee Reports + Laws
- **REMAINING:** ~1,018 remissvar pending AI classification, ~2,949 PDFs pending extraction

---

## Phase 5.6 Status

| Component | Status | Notes |
|-----------|--------|-------|
| 5.6.1 Schema | ✅ COMPLETE | extraction_status, raw_content, extracted_at |
| 5.6.2 Extraction Pipeline | ✅ COMPLETE | Edge function + admin UI deployed |
| 5.6.2 Batch Processing | 🔄 IN PROGRESS | ~14% extracted, 86% remaining |
| 5.6.3 Stance Detection | ✅ COMPLETE | Keyword-based Swedish stance terms |
| 5.6.4 AI Classification | 🔄 IN PROGRESS | Paginated accumulation fix deployed |

---

## Phase 5.4 Research Summary

riksdagen.se provides REST API for Committee Reports and Laws:
- **Committee Reports (betänkanden):** `doktyp=bet`, 333 docs in 2024/25 session
- **Laws (SFS):** `doktyp=sfs`, 161 docs in 2024
- **Format:** JSON available, includes PDF URLs and cross-references
- **Ready for implementation** after Phase 5.6 completion

---

## Known Limitations

### Scanned PDF Extraction (8 documents)
- **Cause:** Image-based PDFs without text layer
- **Organizations affected:** Sametinget (5), SMHI (1), Uppsala universitet (1), other (1)
- **Resolution:** Future OCR capability (Tesseract.js, Google Vision API)
- **Impact:** 0.2% error rate, acceptable for current phase

---

## Next Steps

1. **Complete AI classification:** Process ~1,018 pending remissvar through AI stance classifier
2. **Complete extraction:** Run remaining ~2,949 PDFs through batch processor
3. **Phase 5.4:** Implement Committee Reports + Laws scrapers
4. **Phase 6:** Relationship Inference & Case Reconstruction

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
