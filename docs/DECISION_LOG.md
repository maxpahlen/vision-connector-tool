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
| 2026-02-11 | Phase 6A.1: Deterministic reference resolution pass | N/A | NONE | AGREE | AGREE | AGREE |
| 2026-01-20 | Phase 5.6 Concept Brief created | N/A | NONE | AGREE | AGREE | AGREE |
| 2026-01-20 | Phase 5.5.4 Velocity Dashboard: marked NEEDS DEBUGGING | N/A | NONE | AGREE | AGREE | AGREE |
| 2026-01-20 | Remissvar structure guidance documented for Phase 5.6 | N/A | NONE | AGREE | AGREE | AGREE |
| 2026-01-20 | Phase 5.5.3 Participation Dashboard MVP | N/A | NONE | AGREE | AGREE | AGREE |
| 2026-02-10 | Markdown governance cleanup executed | N/A | NONE | AGREE | AGREE | AGREE |
| 2026-02-10 | Archive policy + DOC_INDEX adopted | N/A | NONE | AGREE | AGREE | AGREE |
| 2026-02-10 | Historical docs archived (37 files) | N/A | NONE | AGREE | AGREE | AGREE |
| 2026-02-10 | Phase 6 readiness gate: GO WITH CONDITIONS | N/A | NONE | AGREE | AGREE | AGREE |
| 2026-02-10 | Operational closure executed (3 items) | N/A | NONE | AGREE | AGREE | AGREE |
| 2026-01-05 | Operating agreement adopted | N/A | NONE | AGREE | AGREE | AGREE |

---

## Decision Details

### 2026-02-11 — Phase 6A.1: Deterministic Reference Resolution Pass

**Description:** First execution slice of Phase 6 Relationship Inference. Enhanced the `resolve-document-references` edge function and ran a full deterministic resolution pass across all 6,801 `document_references`.

**Key Enhancements:**
- Added `Bet.` (committee report) pattern → Riksdagen session code conversion (e.g., `Bet. 2024/25:FiU21` → `HC01FiU21`)
- Added Title+DocNumber combo extraction (e.g., "En förbättrad elevhälsa, SOU 2025:113" → `SOU 2025:113`)
- Fixed double-encoded HTML entities (`&amp;#xF6;` → `ö`)
- Implemented pagination for both reference and document fetches (bypasses 1000-row limit)
- Batched DB updates (parallel groups of 50) for performance

**Before/After Metrics:**
| Metric | Before | After |
|--------|--------|-------|
| Total references | 6,801 | 6,801 |
| Resolved | 84 (1.2%) | 2,157 (31.7%) |
| Unresolved | 6,717 | 4,644 |
| **New resolutions** | — | **2,073** |

**Resolved by Evidence Type:**
| Evidence Type | Count |
|---------------|-------|
| prop_pattern (Prop. YYYY/YY:NN) | 1,025 |
| bet_pattern (Bet. → Riksdagen code) | 923 |
| dir_pattern (Dir. YYYY:NN) | 171 |
| sou_pattern (SOU YYYY:NN) | 38 |

**Remaining Unresolved — Categorized:**
| Category | Count | Notes |
|----------|-------|-------|
| Title-only / unparseable | 2,946 | No doc number in text (e.g., "Om lagstiftningen i Sverige") |
| Bet. not in corpus | 1,278 | Extracted but committee report not yet in DB (older sessions) |
| SOU not in corpus | 171 | Mostly 2025 SOUs not yet ingested |
| Prop not in corpus | 136 | Pre-2015 or very recent propositions |
| Dir not in corpus | 78 | Directives outside backfill window |
| HTML-encoded title-only | 19 | Decoded but no doc number pattern |
| Ministry dossier | 11 | Dossier format, not in documents table |
| Ds not in corpus | 3 | Departementsserie not yet tracked |
| FPM not in corpus | 2 | Faktapromemoria not yet tracked |

**Spot Validation:** 10/10 sampled `bet_pattern` resolutions verified correct (e.g., `Bet. 2024/25:FiU21` → `HC01FiU21` "Vårändringsbudget för 2025" ✓).

**Data Risk:** NONE — Only updates `target_doc_number` (cleanup) and `target_document_id` (linking) on existing rows. No deletions, no schema changes.

**Approvals:**
- AGREE – Max ✓
- AGREE – Lovable ✓
- AGREE – Codex ✓

---


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

---

### 2026-02-10 — Phase 6 Readiness Gate: GO WITH CONDITIONS

**Description:** Big-picture operational closure and readiness assessment conducted before Phase 6 entry. Assessment produced `docs/verification/LOVABLE_PHASE_READINESS_GATE_2026-02-10.md` with verdict: **GO WITH CONDITIONS**.

**Conditions (all executed):**
1. SOU lifecycle_stage backfill (60 documents → `interim_analysis`)
2. Admin UI workflow-tab cleanup (RemissDiscoveryDashboard moved to Monitoring)
3. PRODUCT_ROADMAP metrics reconciliation (verified against database)

**Data Risk:** NONE for UI/docs. SOU backfill is additive (NULL → value).

**Approvals:**
- AGREE – Max ✓
- AGREE – Lovable ✓
- AGREE – Codex ✓

---

### 2026-02-10 — Operational Closure Executed (3 Items)

**Description:** Execution of the 3 closure items required for Phase 6 GO:

1. **SOU lifecycle backfill:** 60 SOUs updated from NULL to `interim_analysis` (valid enum value per `documents_lifecycle_stage_check` constraint). Verified: 60/60 complete.
2. **Admin UI cleanup:** Moved `RemissDiscoveryDashboard` from Scraping tab to Monitoring tab per approved plan. Phase A+B (6-tab model + legacy archival) confirmed already complete.
3. **PRODUCT_ROADMAP reconciliation:** Fixed 7 stale metrics against verified DB state (committee reports: 446→333, laws: 47→161, processes: 127→464, SOUs: 61→60, entities: 1760→1780, timeline events: 1050→1070, responses: 3424→3421). Fixed premature "Phase 6.1/6.2 IN PROGRESS" status. Updated Phase 5 from "📋 Planned" to "✅ Complete" in expected tables section.

**Data Risk:** NONE — SOU backfill is additive; rest is documentation/UI only.

**Approvals:**
- AGREE – Max ✓
- AGREE – Lovable ✓
- AGREE – Codex ✓
