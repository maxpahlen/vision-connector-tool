# Testing Documentation

**Last Updated:** 2026-02-10  
**Maintained by:** Lovable (Architectural Authority)

---

## Overview

This directory contains active testing references for the Legislative Intelligence Platform. Historical test campaign artifacts (metadata agent test groups, protocols, results tracking) have been archived to `docs/archive/testing/`.

---

## Active Test Assets

| File | Purpose |
|------|---------|
| `golden-sou-test-set.md` | Regression baseline: 3 representative SOUs with expected extraction outputs |

---

## Testing Philosophy

1. **Progressive Complexity** — start simple, scale gradually
2. **Defense in Depth** — prompt instructions + server-side validation
3. **Quality Over Speed** — reject uncertain data rather than insert garbage
4. **Real-World Scenarios** — use actual government documents, not mocked data
5. **Document Everything** — lessons learned prevent future regressions

---

## Test Utilities (Edge Functions)

These edge functions run unit tests for shared modules. They are **manual/dev-only** and not part of production workflows.

| Function | Tests | When to Run |
|----------|-------|-------------|
| `test-org-matcher` | `organization-matcher.ts` fuzzy matching | After modifying org matching logic |
| `test-stage-machine` | `process-stage-machine.ts` state transitions | After modifying stage machine |

See `docs/operations/AGENT_RUNBOOK.md` → "Test Utilities" for invocation details.

---

## Archived Test Campaigns

The following completed test campaigns are preserved in `docs/archive/testing/`:

| File | Campaign |
|------|----------|
| `metadata-agent-test-group-5-protocol.md` | Group 5 batch processing protocol |
| `metadata-agent-test-results.md` | Cumulative results (Groups 1–5) |
| `test-group-5-results-tracking.md` | Group 5 real-time tracking |
| `phase-5-test-plan.md` | Phase 5 overall test plan |

**Status:** All test groups 1–5 PASSED. Production rollout approved 2025-11-27.

---

## Related Docs

| Doc | Location |
|-----|----------|
| Agent behaviors & limitations | `docs/operations/AGENT_BEHAVIORS.md` |
| Agent operational runbook | `docs/operations/AGENT_RUNBOOK.md` |
| Golden SOU test set | `docs/testing/golden-sou-test-set.md` |
| Master doc index | `docs/DOC_INDEX.md` |
