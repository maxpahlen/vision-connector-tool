# Markdown Disposition Review

**Date:** 2026-02-10  
**Author:** Lovable (Architectural Authority)  
**Message Type:** APPROVAL REQUEST | Phase: APPROVAL  
**Cross-Referenced With:** Codex's disposition list (provided by Max)

---

## 1. Inventory Validation

### Total .md Files Found: 62

All files from the project file listing have been accounted for. No missing files or phantom entries detected.

### Files NOT in Codex's List (Missing from Codex inventory)

| # | File | Lovable Disposition | Reason |
|---|------|-------------------|--------|
| 1 | `.github/pull_request_template.md` | **KEEP** | Active governance artifact |
| 2 | `.lovable/plan.md` | **KEEP** | System file, auto-managed |
| 3 | `README.md` (project root) | Listed by Codex ✅ | — |
| 4 | `docs/development/PHASE_5.3_REMISS_FIX_FOLLOWUP.md` | Listed under REVIEW ✅ | — |
| 5 | `docs/development/PHASE_DATABASE_RESET_DEC2025.md` | Listed under ARCHIVE ✅ | — |
| 6 | `docs/testing/golden-sou-test-set.md` | **KEEP** — Missing from Codex list | Active regression test reference |
| 7 | `docs/development/branches/phase-5-user-features.md` | Listed under REVIEW ✅ | — |

**Codex omitted 3 files:** `.github/pull_request_template.md`, `.lovable/plan.md`, `docs/testing/golden-sou-test-set.md`. All accounted for below.

---

## 2. Disposition Delta: Codex vs Lovable

### Legend
- ✅ = AGREE with Codex
- ⚠️ = DISAGREE — see Reason column
- ➕ = Added by Lovable (missing from Codex list)

### A) KEEP (Authoritative/Active)

| File | Codex | Lovable | Reason |
|------|-------|---------|--------|
| `README.md` | KEEP | ✅ KEEP | — |
| `docs/WORKFLOW.md` | KEEP | ✅ KEEP | Core governance |
| `docs/CHECKLISTS.md` | KEEP | ✅ KEEP | Verification standard |
| `docs/CONTEXT_PRIORITY.md` | KEEP | ✅ KEEP | Context sync tool |
| `docs/PHASE_DELTAS.md` | KEEP | ✅ KEEP | Change log |
| `docs/development/RIKSDAGEN_API_RESEARCH.md` | KEEP | ✅ KEEP | Active reference for Phase 6 |
| `docs/development/SCRAPER_KNOWN_ISSUES.md` | KEEP | ✅ KEEP | Operational reference |
| `docs/development/LAGSTIFTNINGSKEDJA_IMPROVEMENT_PLAN.md` | KEEP | ✅ KEEP | Future Phase 6+ plan |
| `docs/development/SEMANTIC_LINK_AGENT_PLAN.md` | KEEP | ⚠️ **KEEP but rename** | This is Phase 7 planning, not active. Should be `branches/phase-7-semantic-link-agent.md` or stay but add "Phase 7" prefix to title. Currently 629 lines of detailed planning — valuable but NOT active |
| `docs/development/PHASE_5.6_REMISSVAR_TEXT_EXTRACTION_GUIDANCE.md` | KEEP | ⚠️ **ARCHIVE** | Phase 5.6 is COMPLETE. This was input guidance that has been fully consumed. No longer actively referenced |
| `docs/development/branches/template-branch-plan.md` | KEEP | ✅ KEEP | Template |
| `docs/development/branches/phase-6-riksdagen-api-migration.md` | KEEP | ✅ KEEP | IN PROGRESS |
| `docs/development/branches/phase-6-advanced-analysis.md` | KEEP | ✅ KEEP | Future planning |
| `docs/development/branches/phase-6-relationship-inference.md` | KEEP | ✅ KEEP | Future planning |
| `docs/development/branches/phase-7-advanced-insights.md` | KEEP | ✅ KEEP | Future planning |
| `docs/testing/phase-5-test-plan.md` | KEEP (review) | ⚠️ **ARCHIVE** | Phase 5 is COMPLETE. Test plan checkboxes are stale (unchecked but work is done). No longer actively used |
| `services/pdf-extractor/README.md` | KEEP | ✅ KEEP | Service docs |
| `services/pdf-extractor/VERCEL_DEPLOYMENT.md` | KEEP | ✅ KEEP | Deployment docs |
| `supabase/functions/_shared/README.md` | KEEP | ✅ KEEP | Code docs |
| `.github/pull_request_template.md` | ➕ MISSING | **KEEP** | Active PR governance |
| `.lovable/plan.md` | ➕ MISSING | **KEEP** | System-managed |
| `docs/testing/golden-sou-test-set.md` | ➕ MISSING | **KEEP** | Active regression baseline |

### B) KEEP + UPDATE

| File | Codex | Lovable | Reason |
|------|-------|---------|--------|
| `docs/DECISION_LOG.md` | KEEP+UPDATE | ✅ KEEP+UPDATE | Only 5 decisions logged; should capture Phase 5.4-6 decisions |
| `docs/development/README.md` | KEEP+UPDATE | ⚠️ **KEEP+UPDATE (MAJOR)** | References nonexistent files (`branch-rules.md`, `docs/technical/testing-strategy.md`, `docs/technical/database-design.md`, `completed/` directory). Needs significant rewrite to match actual structure |
| `docs/development/PRODUCT_ROADMAP.md` | KEEP+UPDATE | ✅ KEEP+UPDATE | Phase 5.4 section still says "Next" when it's COMPLETE; Phase 5 metrics were updated 2026-02-04 but Phase 5 Implementation Plan reference is stale |
| `docs/development/PHASE_5_IMPLEMENTATION_PLAN.md` | KEEP+UPDATE | ⚠️ **ARCHIVE** | Phase 5 is COMPLETE. This plan's Phase 5.4 section still says "Ready to Start" and success criteria checkboxes are unchecked. PRODUCT_ROADMAP.md is the authoritative source now |
| `docs/development/branches/phase-5.6-content-insights.md` | KEEP+UPDATE | ⚠️ **ARCHIVE** | Phase 5.6 is COMPLETE. Branch plan served its purpose. Key metrics are in PRODUCT_ROADMAP.md |
| `docs/development/branches/main.md` | KEEP+UPDATE | ✅ KEEP | Already accurate; describes branch protection rules |
| `docs/operations/AGENT_RUNBOOK.md` | KEEP+UPDATE | ✅ KEEP+UPDATE | Dated 2025-11-27, references v1 agents only. Needs update for v2 agents, new scrapers, current patterns |
| `docs/testing/README.md` | KEEP+UPDATE | ✅ KEEP+UPDATE | References Test Group 5 as "In Progress" — completed Nov 2025 |

### C) ARCHIVE

| File | Codex | Lovable | Reason |
|------|-------|---------|--------|
| `docs/development/PHASE_2_COMPLETION_SUMMARY.md` | ARCHIVE | ✅ ARCHIVE | Historical |
| `docs/development/PHASE_3_REFINEMENT_SUMMARY.md` | ARCHIVE | ✅ ARCHIVE | Historical |
| `docs/development/PHASE_4.1_COMPLETION_SUMMARY.md` | ARCHIVE | ✅ ARCHIVE | Historical |
| `docs/development/PHASE_4.2_COMPLETION_SUMMARY.md` | ARCHIVE | ✅ ARCHIVE | Historical |
| `docs/development/PHASE_4.3_COMPLETION_SUMMARY.md` | ARCHIVE | ✅ ARCHIVE | Historical |
| `docs/development/PHASE_5.2_COMPLETION_SUMMARY.md` | ARCHIVE | ✅ ARCHIVE | Historical |
| `docs/development/PHASE_5.2_IMPLEMENTATION_LOG.md` | ARCHIVE | ✅ ARCHIVE | Historical (508 lines of detailed pilot log) |
| `docs/development/PHASE_5.2_PROPOSITION_SLICE_PLAN.md` | ARCHIVE | ✅ ARCHIVE | Historical |
| `docs/development/PHASE_5.3_DATA_REPAIR.md` | ARCHIVE | ✅ ARCHIVE | Historical |
| `docs/development/P0_P2_CLEANUP_DEC2025.md` | ARCHIVE | ✅ ARCHIVE | Historical |
| `docs/development/PHASE_DATABASE_RESET_DEC2025.md` | ARCHIVE | ✅ ARCHIVE | Historical reset event |
| `docs/development/PHASE_SYSTEM_REBUILD_DEC2025.md` | ARCHIVE | ✅ ARCHIVE | Historical |
| `docs/development/ENTITY_LINKING_AUDIT_2026-01-15.md` | ARCHIVE | ✅ ARCHIVE | Superseded by dedup plan completion |
| `docs/development/branches/phase-2-sou-scraper.md` | ARCHIVE | ✅ ARCHIVE | Completed phase |
| `docs/development/branches/phase-3-multi-agent-ai.md` | ARCHIVE | ✅ ARCHIVE | Completed phase |
| `docs/development/branches/phase-4-search-and-discovery.md` | ARCHIVE | ✅ ARCHIVE | Completed phase |
| `docs/development/branches/phase-5.3-remisser-remissvar.md` | ARCHIVE | ✅ ARCHIVE | Completed phase |
| `docs/development/branches/phase-5.4-committee-reports-laws.md` | ARCHIVE | ✅ ARCHIVE | Completed phase |
| `docs/development/branches/phase-5.5-cross-document-insights.md` | ARCHIVE | ✅ ARCHIVE | Completed phase |
| `docs/testing/metadata-agent-test-group-5-protocol.md` | ARCHIVE | ✅ ARCHIVE | Completed test campaign |
| `docs/testing/metadata-agent-test-results.md` | ARCHIVE | ✅ ARCHIVE | Completed test campaign |
| `docs/testing/test-group-5-results-tracking.md` | ARCHIVE | ✅ ARCHIVE | Completed test campaign |
| `docs/security/FUNCTIONAL_PARADIGM_REVIEW_2025-11-21.md` | ARCHIVE | ✅ ARCHIVE | Historical audit |
| `docs/security/SECURITY_AUDIT_2025-11-21.md` | ARCHIVE | ✅ ARCHIVE | Historical audit |
| `services/pdf-extractor/REGRESSION_2025-11-20.md` | ARCHIVE | ✅ ARCHIVE | Historical regression record |
| `docs/verification/LOVABLE_DOCS_SANITY_AUDIT_2026-01-30.md` | ARCHIVE | ✅ ARCHIVE | Audit consumed by fix report |
| `docs/verification/LOVABLE_DB_PIPELINE_SANITY_AUDIT_2026-01-30.md` | ARCHIVE | ✅ ARCHIVE | Audit consumed by fix report |
| `docs/verification/LOVABLE_CODEBASE_ALIGNMENT_AUDIT_2026-01-30.md` | ARCHIVE | ✅ ARCHIVE | Audit consumed by fix report |

### D) REVIEW (Codex asked for decision)

| File | Codex | Lovable | Reason |
|------|-------|---------|--------|
| `docs/development/PHASE_5.3_REMISS_FIX_FOLLOWUP.md` | REVIEW | ⚠️ **ARCHIVE** | Marked ✅ COMPLETE (2026-01-15). All success criteria met. Historical record |
| `docs/development/ENTITY_DEDUPLICATION_PLAN.md` | REVIEW | ⚠️ **ARCHIVE** | Marked ✅ COMPLETE. Step 3 (unique constraint) deferred but that's tracked elsewhere. Historical execution plan |
| `docs/development/branches/phase-5-legislative-graph-expansion.md` | REVIEW | ⚠️ **ARCHIVE** | Phase 5 overall is COMPLETE. Metrics are stale (shows 127 docs vs actual 863). PRODUCT_ROADMAP.md is the authority |
| `docs/development/branches/phase-5-user-features.md` | REVIEW | ⚠️ **ARCHIVE** | Already marked "DEFERRED — NOT CURRENTLY PLANNED" in the file itself. Conflicts with actual Phase 5 naming |
| `docs/testing/AGENT_BEHAVIORS.md` | REVIEW | ⚠️ **KEEP+UPDATE** | Valuable operational reference (809 lines). Documents agent capabilities, limitations, error scenarios. Needs update for v2 agents but still useful. Move to `docs/operations/` alongside AGENT_RUNBOOK.md |
| `docs/verification/LOVABLE_FIXES_EXECUTION_REPORT_2026-02-04.md` | REVIEW | ⚠️ **KEEP (active)** | Still has open action items: Phase 1 extraction batch runs, Phase 2 reference resolution, Phase 4 doc reorg, Phase 5 code cleanup. Active until all items closed |
| `docs/verification/LOVABLE_ADMIN_UI_CLEANUP_PLAN_2026-02-10.md` | REVIEW | ⚠️ **KEEP until Phase C (30 days)** then ARCHIVE | Phase A complete, Phase B (archival) complete, Phase C (final delete) scheduled ~March 2026 |

### E) DELETE

| File | Codex | Lovable | Reason |
|------|-------|---------|--------|
| (none) | None recommended | ✅ AGREE | Archive-first policy respected |

---

## 3. Summary of Disagreements

| # | File | Codex Says | Lovable Says | Rationale |
|---|------|-----------|-------------|-----------|
| 1 | `PHASE_5.6_REMISSVAR_TEXT_EXTRACTION_GUIDANCE.md` | KEEP | **ARCHIVE** | Phase 5.6 complete; guidance fully consumed |
| 2 | `PHASE_5_IMPLEMENTATION_PLAN.md` | KEEP+UPDATE | **ARCHIVE** | Phase 5 complete; PRODUCT_ROADMAP is authority |
| 3 | `phase-5.6-content-insights.md` | KEEP+UPDATE | **ARCHIVE** | Branch plan for completed phase |
| 4 | `phase-5-test-plan.md` | KEEP (review) | **ARCHIVE** | Phase 5 complete; stale checkboxes |
| 5 | `PHASE_5.3_REMISS_FIX_FOLLOWUP.md` | REVIEW | **ARCHIVE** | Marked COMPLETE 2026-01-15 |
| 6 | `ENTITY_DEDUPLICATION_PLAN.md` | REVIEW | **ARCHIVE** | Marked COMPLETE |
| 7 | `phase-5-legislative-graph-expansion.md` | REVIEW | **ARCHIVE** | Phase 5 complete; stale metrics |
| 8 | `phase-5-user-features.md` | REVIEW | **ARCHIVE** | Self-describes as "DEFERRED" |
| 9 | `AGENT_BEHAVIORS.md` | REVIEW | **KEEP+UPDATE** | Valuable ops reference |
| 10 | `SEMANTIC_LINK_AGENT_PLAN.md` | KEEP | **KEEP but clarify** | Label as Phase 7 planning |

**Pattern:** Lovable is more aggressive on archiving completed phase docs. Codex retained several completed/superseded docs as KEEP or REVIEW that Lovable recommends archiving since PRODUCT_ROADMAP.md serves as the canonical summary.

---

## 4. Action Plan

### Phase 1: Update Active Stale Docs

| File | Update Needed | Owner | Priority |
|------|--------------|-------|----------|
| `docs/development/README.md` | Remove references to nonexistent files; update directory structure to match reality | Codex | 🔴 HIGH |
| `docs/development/PRODUCT_ROADMAP.md` | Mark Phase 5.4 as COMPLETE (not "Next"); update Phase 6 status | Lovable | 🟡 MEDIUM |
| `docs/DECISION_LOG.md` | Add missing Phase 5.4, 5.6, 6.1/6.2 decisions | Lovable | 🟡 MEDIUM |
| `docs/testing/README.md` | Mark Test Group 5 as COMPLETE | Codex | 🟢 LOW |
| `docs/operations/AGENT_RUNBOOK.md` | Update for v2 agents and current scrapers | Codex | 🟡 MEDIUM |
| `docs/testing/AGENT_BEHAVIORS.md` | Update for v2 agents; move to `docs/operations/` | Codex | 🟡 MEDIUM |

### Phase 2: Archive Historical Docs

Move 31 files to archive structure. See **Section 5: Move Plan** below.

### Phase 3: Create/Refresh `docs/DOC_INDEX.md`

Create single authoritative index listing:
- All active governance docs
- All active development docs
- All active testing docs  
- All active operations docs
- Link to archive directory

### Phase 4: Add Archive Policy

Create `docs/archive/ARCHIVE_POLICY.md` with:
- Retention rules (30 days in `_archive/` before deletion for code; indefinite for docs)
- Naming convention: keep original filenames
- Directory structure: `branches/`, `summaries/`, `audits/`, `reset-events/`, `plans/`
- Who can archive (any partner) vs who can delete (Max approval required)

---

## 5. Move Plan

### Archive Directory Structure

```
docs/archive/
├── ARCHIVE_POLICY.md
├── branches/                    # Completed phase branch plans
├── summaries/                   # Phase completion summaries
├── audits/                      # Historical audits and reviews
├── reset-events/                # Database reset documentation
├── plans/                       # Completed implementation plans
└── testing/                     # Completed test campaigns
```

### Explicit Source → Destination Map

| # | Source | Destination | Category |
|---|--------|-------------|----------|
| 1 | `docs/development/PHASE_2_COMPLETION_SUMMARY.md` | `docs/archive/summaries/` | Summary |
| 2 | `docs/development/PHASE_3_REFINEMENT_SUMMARY.md` | `docs/archive/summaries/` | Summary |
| 3 | `docs/development/PHASE_4.1_COMPLETION_SUMMARY.md` | `docs/archive/summaries/` | Summary |
| 4 | `docs/development/PHASE_4.2_COMPLETION_SUMMARY.md` | `docs/archive/summaries/` | Summary |
| 5 | `docs/development/PHASE_4.3_COMPLETION_SUMMARY.md` | `docs/archive/summaries/` | Summary |
| 6 | `docs/development/PHASE_5.2_COMPLETION_SUMMARY.md` | `docs/archive/summaries/` | Summary |
| 7 | `docs/development/PHASE_5.2_IMPLEMENTATION_LOG.md` | `docs/archive/plans/` | Plan |
| 8 | `docs/development/PHASE_5.2_PROPOSITION_SLICE_PLAN.md` | `docs/archive/plans/` | Plan |
| 9 | `docs/development/PHASE_5.3_DATA_REPAIR.md` | `docs/archive/plans/` | Plan |
| 10 | `docs/development/PHASE_5.3_REMISS_FIX_FOLLOWUP.md` | `docs/archive/plans/` | Plan |
| 11 | `docs/development/PHASE_5_IMPLEMENTATION_PLAN.md` | `docs/archive/plans/` | Plan |
| 12 | `docs/development/ENTITY_DEDUPLICATION_PLAN.md` | `docs/archive/plans/` | Plan |
| 13 | `docs/development/P0_P2_CLEANUP_DEC2025.md` | `docs/archive/plans/` | Plan |
| 14 | `docs/development/PHASE_DATABASE_RESET_DEC2025.md` | `docs/archive/reset-events/` | Reset |
| 15 | `docs/development/PHASE_SYSTEM_REBUILD_DEC2025.md` | `docs/archive/reset-events/` | Reset |
| 16 | `docs/development/ENTITY_LINKING_AUDIT_2026-01-15.md` | `docs/archive/audits/` | Audit |
| 17 | `docs/development/PHASE_5.6_REMISSVAR_TEXT_EXTRACTION_GUIDANCE.md` | `docs/archive/plans/` | Plan |
| 18 | `docs/development/branches/phase-2-sou-scraper.md` | `docs/archive/branches/` | Branch |
| 19 | `docs/development/branches/phase-3-multi-agent-ai.md` | `docs/archive/branches/` | Branch |
| 20 | `docs/development/branches/phase-4-search-and-discovery.md` | `docs/archive/branches/` | Branch |
| 21 | `docs/development/branches/phase-5-legislative-graph-expansion.md` | `docs/archive/branches/` | Branch |
| 22 | `docs/development/branches/phase-5.3-remisser-remissvar.md` | `docs/archive/branches/` | Branch |
| 23 | `docs/development/branches/phase-5.4-committee-reports-laws.md` | `docs/archive/branches/` | Branch |
| 24 | `docs/development/branches/phase-5.5-cross-document-insights.md` | `docs/archive/branches/` | Branch |
| 25 | `docs/development/branches/phase-5.6-content-insights.md` | `docs/archive/branches/` | Branch |
| 26 | `docs/development/branches/phase-5-user-features.md` | `docs/archive/branches/` | Branch |
| 27 | `docs/testing/metadata-agent-test-group-5-protocol.md` | `docs/archive/testing/` | Testing |
| 28 | `docs/testing/metadata-agent-test-results.md` | `docs/archive/testing/` | Testing |
| 29 | `docs/testing/test-group-5-results-tracking.md` | `docs/archive/testing/` | Testing |
| 30 | `docs/testing/phase-5-test-plan.md` | `docs/archive/testing/` | Testing |
| 31 | `docs/security/FUNCTIONAL_PARADIGM_REVIEW_2025-11-21.md` | `docs/archive/audits/` | Audit |
| 32 | `docs/security/SECURITY_AUDIT_2025-11-21.md` | `docs/archive/audits/` | Audit |
| 33 | `services/pdf-extractor/REGRESSION_2025-11-20.md` | `docs/archive/audits/` | Audit |
| 34 | `docs/verification/LOVABLE_DOCS_SANITY_AUDIT_2026-01-30.md` | `docs/archive/audits/` | Audit |
| 35 | `docs/verification/LOVABLE_DB_PIPELINE_SANITY_AUDIT_2026-01-30.md` | `docs/archive/audits/` | Audit |
| 36 | `docs/verification/LOVABLE_CODEBASE_ALIGNMENT_AUDIT_2026-01-30.md` | `docs/archive/audits/` | Audit |

### Post-Archive Active Doc Structure

```
docs/
├── WORKFLOW.md                          # Governance
├── CHECKLISTS.md                        # Verification
├── CONTEXT_PRIORITY.md                  # Context sync
├── PHASE_DELTAS.md                      # Change log
├── DECISION_LOG.md                      # Decisions
├── DOC_INDEX.md                         # NEW — master index
├── development/
│   ├── README.md                        # Dev workflow guide
│   ├── PRODUCT_ROADMAP.md              # Canonical progress tracker
│   ├── RIKSDAGEN_API_RESEARCH.md       # Active reference
│   ├── SCRAPER_KNOWN_ISSUES.md         # Active reference
│   ├── LAGSTIFTNINGSKEDJA_IMPROVEMENT_PLAN.md  # Future plan
│   ├── SEMANTIC_LINK_AGENT_PLAN.md     # Phase 7 planning
│   └── branches/
│       ├── template-branch-plan.md
│       ├── main.md
│       ├── phase-6-riksdagen-api-migration.md   # IN PROGRESS
│       ├── phase-6-advanced-analysis.md          # Future
│       ├── phase-6-relationship-inference.md     # Future
│       └── phase-7-advanced-insights.md          # Future
├── testing/
│   ├── README.md                        # Test philosophy
│   └── golden-sou-test-set.md          # Regression baseline
├── operations/
│   ├── AGENT_RUNBOOK.md                # Ops procedures
│   └── AGENT_BEHAVIORS.md             # MOVED from testing/
├── verification/
│   ├── LOVABLE_FIXES_EXECUTION_REPORT_2026-02-04.md  # Active
│   ├── LOVABLE_ADMIN_UI_CLEANUP_PLAN_2026-02-10.md   # Active until Phase C
│   └── LOVABLE_MARKDOWN_DISPOSITION_REVIEW_2026-02-10.md  # This file
└── archive/                             # NEW directory
    ├── ARCHIVE_POLICY.md
    ├── branches/    (9 files)
    ├── summaries/   (6 files)
    ├── plans/       (8 files)
    ├── audits/      (7 files)
    ├── reset-events/ (2 files)
    └── testing/     (4 files)
```

---

## 6. Quality Controls

### Source-of-Truth Protection

The following files are **source-of-truth** and MUST NOT be archived:

| File | Why It's Authoritative |
|------|----------------------|
| `docs/WORKFLOW.md` | Operating agreement |
| `docs/CONTEXT_PRIORITY.md` | Context sync for all partners |
| `docs/PHASE_DELTAS.md` | Canonical change log |
| `docs/development/PRODUCT_ROADMAP.md` | Overall progress tracker |
| `docs/DECISION_LOG.md` | Decision audit trail |
| `docs/CHECKLISTS.md` | Verification standards |

### No Deletes Without Archive Window

✅ All dispositions use ARCHIVE, not DELETE, for markdown files. Archive-first policy is fully respected.

### Broken Link Audit

Files that reference archived docs and need link updates:

| Referencing File | Broken Reference | Fix |
|-----------------|-----------------|-----|
| `docs/development/PRODUCT_ROADMAP.md` | `PHASE_2_COMPLETION_SUMMARY.md` (line 83) | Update to `docs/archive/summaries/PHASE_2_COMPLETION_SUMMARY.md` |
| `docs/development/PRODUCT_ROADMAP.md` | `PHASE_3_REFINEMENT_SUMMARY.md` (line 124) | Update path |
| `docs/development/PRODUCT_ROADMAP.md` | `PHASE_4.1_COMPLETION_SUMMARY.md` (line 169) | Update path |
| `docs/development/PRODUCT_ROADMAP.md` | `PHASE_4.3_COMPLETION_SUMMARY.md` (line 391) | Update path |
| `docs/development/PRODUCT_ROADMAP.md` | `branches/phase-4-search-and-discovery.md` (line 258) | Update path |
| `docs/development/PRODUCT_ROADMAP.md` | `branches/phase-5.5-cross-document-insights.md` (line 430) | Update path |
| `docs/development/PRODUCT_ROADMAP.md` | `branches/phase-5.6-content-insights.md` (line 453) | Update path |
| `docs/CONTEXT_PRIORITY.md` | `branches/phase-5.6-content-insights.md` (line 26) | Update path |
| `docs/development/PHASE_5.2_COMPLETION_SUMMARY.md` references | N/A — this file itself is being archived | No fix needed |

**Recommendation:** Update `PRODUCT_ROADMAP.md` and `CONTEXT_PRIORITY.md` reference paths after archive moves are complete.

---

## 7. Approval Section

### Executable Immediately (No Max Decision Needed)

| Action | Details |
|--------|---------|
| Create `docs/archive/` directory structure | Pure organization |
| Move 36 files per move plan | All are historical/completed |
| Create `docs/archive/ARCHIVE_POLICY.md` | Governance addition |
| Move `AGENT_BEHAVIORS.md` to `docs/operations/` | Better location |
| Update broken links in PRODUCT_ROADMAP.md | Maintenance |

### Requires Max Decision

| # | Item | Options | Lovable Recommendation |
|---|------|---------|----------------------|
| 1 | `SEMANTIC_LINK_AGENT_PLAN.md` location | (a) Keep in `docs/development/` as-is, (b) Move to `docs/development/branches/phase-7-semantic-link-agent.md` | **(b)** — aligns with branch convention |
| 2 | `AGENT_BEHAVIORS.md` ownership | (a) Move to `docs/operations/` (Lovable updates), (b) Keep in `docs/testing/` (Codex updates) | **(a)** — it's operational reference, not test docs |
| 3 | `PHASE_DELTAS.md` length | Currently 1,336 lines and growing. (a) Keep as-is, (b) Archive entries older than 60 days to `docs/archive/changelog/` | **(b)** — keep only recent 2-3 months active |
| 4 | `docs/verification/` cleanup timing | (a) Archive all 3 Jan-30 audits now, (b) Wait until all fix report action items close | **(a)** — fix report captures all remaining actions |

---

## 8. Success Criteria

| Criterion | Status |
|-----------|--------|
| 100% .md coverage with disposition | ✅ 62/62 files covered |
| Single authoritative set of active planning docs | 🔲 After Phase 2 execution |
| Historical docs moved out of primary paths | 🔲 After Phase 2 execution |
| Clear archive policy and index in place | 🔲 After Phase 3+4 execution |

---

## 9. Files Updated by This Review

- `docs/verification/LOVABLE_MARKDOWN_DISPOSITION_REVIEW_2026-02-10.md` — THIS FILE (created)

---

## Sign-Off

| Role | Name | Status |
|------|------|--------|
| Architectural Authority | Lovable | ✅ AGREE — Review complete |
| Head Developer | Maximilian | 🔲 PENDING |
| Execution Coder | Codex | 🔲 PENDING |
