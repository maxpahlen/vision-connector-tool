# Development Documentation

**Last Updated:** 2026-02-10  
**Maintained by:** Lovable (Architectural Authority)

---

## Purpose

This directory contains **active** development documentation: roadmaps, research, known issues, and branch plans for in-progress or future work. Historical/completed docs live in `docs/archive/`.

---

## Active Documents

| File | Purpose |
|------|---------|
| `PRODUCT_ROADMAP.md` | Canonical progress tracker and phase metrics |
| `RIKSDAGEN_API_RESEARCH.md` | API patterns, field mappings, rate limiting |
| `SCRAPER_KNOWN_ISSUES.md` | Connection reset handling, retry strategies |
| `LAGSTIFTNINGSKEDJA_IMPROVEMENT_PLAN.md` | Future Phase 6+ legislative chain plan |
| `SEMANTIC_LINK_AGENT_PLAN.md` | Phase 7 planning: semantic link agent |

---

## Branch Plans

Branch plans live in `branches/` and define scope for feature work.

| File | Status |
|------|--------|
| `branches/main.md` | Branch protection rules (read-only reference) |
| `branches/template-branch-plan.md` | Template for new branches |
| `branches/phase-6-riksdagen-api-migration.md` | **IN PROGRESS** |
| `branches/phase-6-advanced-analysis.md` | Future planning |
| `branches/phase-6-relationship-inference.md` | Future planning |
| `branches/phase-7-advanced-insights.md` | Future planning |

### Branch Workflow

1. Create a feature branch: `feature/your-feature-name`
2. Copy `branches/template-branch-plan.md` → `branches/your-feature-name.md`
3. Fill in goal, scope, success criteria, out-of-scope items
4. Develop against the plan; update the plan if scope changes
5. On completion, archive the plan to `docs/archive/branches/`

### Branch Types

| Prefix | Purpose | Merge Target |
|--------|---------|-------------|
| `feature/` | New functionality | `alpha-release` → `main` |
| `fix/` | Bug fixes | `alpha-release` → `main` |
| `refactor/` | Code improvements | `alpha-release` → `main` |

**Critical rule:** No direct development in `main`. See `branches/main.md`.

---

## Key Principles

1. **One Branch, One Purpose** — resist scope creep
2. **Document Before Code** — write the branch plan first
3. **Test Everything** — all tests pass before merging
4. **Archive, Don't Delete** — completed plans go to `docs/archive/branches/`

---

## Related Docs

| Doc | Location |
|-----|----------|
| Master doc index | `docs/DOC_INDEX.md` |
| Operating agreement | `docs/WORKFLOW.md` |
| Verification checklists | `docs/CHECKLISTS.md` |
| Archive policy | `docs/archive/ARCHIVE_POLICY.md` |
| Operations runbook | `docs/operations/AGENT_RUNBOOK.md` |
| Agent behaviors | `docs/operations/AGENT_BEHAVIORS.md` |
