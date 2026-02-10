# Decision Log

Running log of approved decisions for the Legislative Intelligence Platform.

---

## Log Format

| Date | Change Title | PR/Issue | Data Risk | Max | Lovable | Codex |
|------|--------------|----------|-----------|-----|---------|-------|
| YYYY-MM-DD | Brief title | #link | NONE / DESTRUCTIVE / IRREVERSIBLE | AGREE | AGREE | AGREE |

### Data Risk Classifications

- **NONE** — No data impact, purely additive, fully reversible
- **DESTRUCTIVE** — Modifies or deletes existing data (requires rollback plan)
- **IRREVERSIBLE** — Cannot be rolled back without data loss

---

## Decisions

| Date | Change Title | PR/Issue | Data Risk | Max | Lovable | Codex |
|------|--------------|----------|-----------|-----|---------|-------|
| 2026-01-20 | Phase 5.6 Concept Brief created | N/A | NONE | AGREE | AGREE | AGREE |
| 2026-01-20 | Phase 5.5.4 Velocity Dashboard: marked NEEDS DEBUGGING | N/A | NONE | AGREE | AGREE | AGREE |
| 2026-01-20 | Remissvar structure guidance documented for Phase 5.6 | N/A | NONE | AGREE | AGREE | AGREE |
| 2026-01-20 | Phase 5.5.3 Participation Dashboard MVP | N/A | NONE | AGREE | AGREE | AGREE |
| 2026-02-10 | Markdown governance cleanup executed | N/A | NONE | AGREE | AGREE | AGREE |
| 2026-02-10 | Archive policy + DOC_INDEX adopted | N/A | NONE | AGREE | AGREE | AGREE |
| 2026-02-10 | Historical docs archived (37 files) | N/A | NONE | AGREE | AGREE | AGREE |
| 2026-01-05 | Operating agreement adopted | N/A | NONE | AGREE | AGREE | AGREE |

---

## Decision Details

### 2026-02-10 — Markdown Governance Cleanup

**Description:** Full markdown disposition review and execution:
- Cross-referenced all 62 `.md` files against Codex's keep/archive/review list
- Lovable produced independent disposition review with 10 disagreements resolved
- Max approved final keep (22 files) / archive (37 files) plan

**Actions Taken:**
- Archived 37 historical docs to `docs/archive/` (branches, summaries, plans, audits, reset-events, testing)
- Moved `AGENT_BEHAVIORS.md` from `docs/testing/` to `docs/operations/`
- Created `docs/archive/ARCHIVE_POLICY.md` (retention rules, naming, who can archive/delete)
- Created `docs/DOC_INDEX.md` (master index of all active docs)
- Updated broken links in `PRODUCT_ROADMAP.md` and `CONTEXT_PRIORITY.md`
- Rewrote `docs/development/README.md` (removed stale references to nonexistent paths)
- Rewrote `docs/testing/README.md` (converted to archive-era index)
- Updated `docs/operations/AGENT_RUNBOOK.md` to v2 (current tabs, tools, verification split)
- Updated `docs/operations/AGENT_BEHAVIORS.md` to v2 (current behavior notes, deprecated assumptions)

**Data Risk:** NONE — Documentation-only changes

**Approvals:**
- AGREE – Max ✓
- AGREE – Lovable ✓
- AGREE – Codex ✓

---

### 2026-02-10 — Archive Policy + DOC_INDEX Adopted

**Description:** Established canonical archive governance:
- `docs/archive/ARCHIVE_POLICY.md`: Archive-first policy, no deletions without Max approval, structured subdirectories
- `docs/DOC_INDEX.md`: Master index covering governance, development, testing, operations, verification, services, and archive docs
- Protected source-of-truth docs (WORKFLOW, CHECKLISTS, DECISION_LOG, etc.) explicitly excluded from archival

**Data Risk:** NONE — Documentation only

**Approvals:**
- AGREE – Max ✓
- AGREE – Lovable ✓
- AGREE – Codex ✓

---

### 2026-01-20 — Phase 5.5.3 Participation Dashboard MVP

**Description:** Implementation of the Participation Dashboard MVP with the following scope:

**In Scope (Implemented):**
- Edge function `get-participation-metrics` with pagination to bypass 1000-row limit
- Entity page remiss participation display (Remissvar + Inbjudningar sections)
- Uninvited response visibility metric ("Oinbjudna svar" column)
- Participation rate formula clarity (tooltips explaining calculation)
- Dashboard navigation entry ("Insikter" link in Header)
- Organization search/filter functionality
- Breadcrumb navigation fix (navigate(-1) for browser history)

**Explicitly Out of Scope (Deferred to Phase 5.6+):**
- Ministry filter
- Export functionality
- Response content extraction pipeline
- NLP/sentiment analysis
- Longitudinal trend analysis

**Critical Bug Fixed:**
- Edge function pagination: Original implementation hit Supabase's 1000-row default limit, causing undercounting. Fixed by implementing pagination loop to fetch all rows before aggregation.

**Metrics Definition:**
- Response Count: Raw row counts from `remiss_responses` (not distinct remiss_id)
- Invite Count: Raw row counts from `remiss_invitees` (not distinct remiss_id)
- Response Rate: (Responses / Invites) × 100% (null if no invites)
- Uninvited Responses: Responses where remiss_id NOT IN org's invites (distinct remiss count)

**Data Risk:** NONE — Read-only aggregation, no data modifications

**Approvals:**
- AGREE – Max ✓
- AGREE – Lovable ✓
- AGREE – Codex ✓

---

### 2026-01-20 — Remissvar structure guidance documented for Phase 5.6

**Description:** Captured structure and language guidance from “Svara på remiss” (SB PM 2021:1) to inform future remissvar text extraction + NLP analysis planning. This includes recommended sections (summary, stance statements, section references) and parsing cues for response structure.

**Data Risk:** NONE — Documentation only

**Approvals:**
- AGREE – Max ✓
- AGREE – Lovable ✓
- AGREE – Codex ✓

---

### 2026-01-05 — Operating agreement adopted

**Description:** Adoption of the 3-party governance and workflow model establishing:
- Maximilian as Head Developer and final decision-maker
- Lovable as architectural authority and sole owner of DB/RLS/storage
- Codex as execution coder for app-level changes
- Four-phase workflow: PROPOSAL → APPROVAL → EXECUTION → VERIFICATION
- Message discipline with mandatory type and phase labels
- Architectural drift detection for protected paths

**Data Risk:** NONE — Documentation only, no database changes

**Approvals:**
- AGREE – Max ✓
- AGREE – Lovable ✓
- AGREE – Codex ✓
