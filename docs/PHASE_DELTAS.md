# Phase Deltas

Chronological log of changes between syncs. Keep entries brief and bullet-based.

---

## Format

```
[DATE] – [PHASE X.Y] – [TITLE]

Changed:
- Item 1
- Item 2

DB Impact: None | Migration required | RLS updated

Pending:
- Item if any

Blocked:
None | #blocking-<reason>
```

---

## Log

### 2026-01-05 – Phase 5.3 – Task 3: Remiss Index Scraper UI (COMPLETE)

Changed:
- Updated `docs/development/branches/phase-5.3-remisser-remissvar.md` to clarify Scrape→Match is primary strategy
- Created `src/components/admin/RemissIndexScraperTest.tsx` for running `scrape-remiss-index`
- Added component to AdminScraper Remisser tab (positioned as primary tool)
- Updated tab description to reflect correct strategy

DB Impact: None

Pending:
- Execute scraper to populate remiss_documents

Blocked:
None

---

### 2026-01-05 – Phase 5.3 – Task 2: Entity Role Normalization (COMPLETE)

Changed:
- Normalized `särskild utredare` → `särskild_utredare` (7 entities)
- Preserved minister-specific roles: statsminister, finansminister, justitieminister, arbetsmarknadsminister, statsråd

DB Impact: Data updated (7 rows in entities table)

Pending:
None

Blocked:
None

---

### 2026-01-05 – Phase 5.3 – Task 1: Contaminated SOU Cleanup (COMPLETE)

Changed:
- Deleted document_references from SOU 2025:2, SOU 2025:105, SOU 2025:106
- Deleted entities linked to those 3 SOUs
- SOU 2025:2: DELETED (confirmed to be a directive, not an SOU)
- SOU 2025:105, SOU 2025:106: URLs verified, metadata reset for re-scraping

DB Impact: Data deleted and reset (irreversible, but data was contaminated)

Pending:
None

Blocked:
None

---

### 2026-01-05 – Phase 5.3 – Operating Agreement Adopted

Changed:
- Created `docs/WORKFLOW.md` (roles, phases, message discipline)
- Created `docs/DECISION_LOG.md` (decision tracking)
- Created `docs/CHECKLISTS.md` (verification checklists)
- Created `.github/pull_request_template.md` (PR guardrails)
- Created `docs/PHASE_DELTAS.md` (this file)

DB Impact: None

Pending:
- Codex confirmation of file access

Blocked:
None
