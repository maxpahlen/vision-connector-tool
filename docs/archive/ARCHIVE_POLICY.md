# Archive Policy

**Last Updated:** 2026-02-10  
**Owner:** Lovable (Architectural Authority)

---

## Purpose

This directory contains historical documentation that is no longer actively referenced but preserved for traceability and audit purposes.

---

## Retention Rules

| Category | Retention | Notes |
|----------|-----------|-------|
| **Markdown docs** | Indefinite | Archive-first; never delete without Max approval |
| **Code (components)** | 30 days in `_archive/` then delete | Per admin UI cleanup plan |
| **Database migrations** | Indefinite (read-only) | Managed by Lovable Cloud |

---

## Directory Structure

```
docs/archive/
├── ARCHIVE_POLICY.md          # This file
├── branches/                  # Completed phase branch plans
├── summaries/                 # Phase completion summaries
├── plans/                     # Completed implementation/execution plans
├── audits/                    # Historical audits, security reviews, regression records
├── reset-events/              # Database reset/rebuild documentation
└── testing/                   # Completed test campaigns and results
```

---

## Naming Convention

- Files keep their **original filename** when archived
- No date-prefixing or renaming on move
- The archive subdirectory provides category context

---

## Who Can Archive vs Delete

| Action | Who |
|--------|-----|
| **Archive** (move to `docs/archive/`) | Any partner (Lovable, Codex, Max) |
| **Delete** (permanent removal) | Requires **Max approval** |

---

## When to Archive

A document should be archived when:

1. Its phase/feature is **COMPLETE** and metrics are captured in `PRODUCT_ROADMAP.md`
2. It has been **superseded** by a newer authoritative document
3. It was a one-time audit/review whose findings have been **consumed** by a fix report
4. It describes a test campaign that is **finished** with results recorded

---

## When NOT to Archive

Never archive:

- `docs/WORKFLOW.md` — operating agreement
- `docs/CHECKLISTS.md` — verification standards
- `docs/CONTEXT_PRIORITY.md` — context sync tool
- `docs/PHASE_DELTAS.md` — canonical change log
- `docs/DECISION_LOG.md` — decision audit trail
- `docs/development/PRODUCT_ROADMAP.md` — overall progress tracker

These are **source-of-truth** documents and must remain in their active locations.

---

## Link Maintenance

When archiving a file, check for references in active docs (especially `PRODUCT_ROADMAP.md`, `CONTEXT_PRIORITY.md`) and update paths to point to `docs/archive/...`.
