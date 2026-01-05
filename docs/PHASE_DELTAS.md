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

### 2026-01-05 – Phase 5.3 – Task 1: Contaminated SOU Cleanup

Changed:
- Deleted document_references from SOU 2025:2, SOU 2025:105, SOU 2025:106
- Deleted entities linked to those 3 SOUs
- Reset url, pdf_url, raw_content to NULL for those 3 SOUs

DB Impact: Data deleted and reset (irreversible, but data was contaminated)

Pending:
- Manual URL lookup for correct SOU pages on regeringen.se
- Re-scrape after correct URLs are set

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
