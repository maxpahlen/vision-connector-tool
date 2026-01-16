# Phase 5.5: Cross-Document Insights Foundation

> **Status:** APPROVED  
> **Owner:** Lovable (Architectural Authority)  
> **Created:** 2026-01-16  
> **Approval:** Max approved 2026-01-16

## Objective

Build cross-document linkage and minimal insights using the existing corpus (Directives, SOUs, Remissinstanser, Remissvar, Propositions), sequencing work to ensure each step is stable before the next.

---

## Phase 5.5.1: Reference Resolution

**Status:** TODO  
**Owner:** Lovable

### Goal
Maximize resolution of 513 unresolved document references using existing documents.

### Current State (as of 2026-01-16)

| Category | Count | Notes |
|----------|-------|-------|
| Unresolved "cites" | 466 | Primary target |
| Unresolved "related" | 36 | Many are titles, not doc numbers |
| Unresolved "amends" | 11 | Likely external documents |
| **Total Unresolved** | **513** | |

### Scope & Guardrails

**What it does:**
- Runs ONLY on references where `target_document_id IS NULL`
- Extracts canonical doc number from `target_url` or `target_doc_number`
- Matches against existing `documents.doc_number`
- Updates `target_document_id` for confirmed matches
- Cleans `target_doc_number` to canonical format (e.g., "SOU 2025:12")

**What it does NOT do:**
- Does NOT overwrite existing `target_document_id` values
- Does NOT create new documents
- Does NOT modify references that already have a resolved target

**Ownership:** Lovable-owned (DB-adjacent operation)

### Implementation

1. Run existing `resolve-document-references` edge function with `dryRun: true` first
2. Analyze dry-run results for false positives
3. Run with `dryRun: false` on confirmed-safe batch
4. Document unresolvable references (external documents not in corpus)

### Success Criteria

- [ ] All references with extractable doc numbers have `target_doc_number` cleaned
- [ ] All references pointing to documents in our corpus have `target_document_id` set
- [ ] Zero false-positive matches (validated via spot-check)
- [ ] Baseline metrics documented: X resolved, Y unresolvable (external)

---

## Phase 5.5.2: Directive-SOU Linking

**Status:** TODO  
**Owner:** Lovable  
**Prerequisite:** Phase 5.5.1 complete

### Goal
Create explicit directive → SOU relationships by parsing directive citations from SOU content.

### Scope & Guardrails

**What it does:**
- Parses `Dir. YYYY:NN` patterns from SOU document titles and first 5000 chars of `raw_content`
- Matches against existing directive documents in the corpus
- Creates `document_references` with `reference_type: 'fulfills'`

**Validation Rules (STRICT):**
1. Both directive AND SOU must exist in the corpus
2. Directive number must be confidently extracted (exact pattern match)
3. Ambiguous matches are LOGGED but NOT created automatically
4. No duplicate references created (check before insert)

**What it does NOT do:**
- Does NOT create references to documents outside our corpus
- Does NOT guess or fuzzy-match directive numbers
- Does NOT modify existing references

**Ownership:** Lovable-owned (DB-adjacent, requires explicit approval before execution)

### Implementation

1. Create edge function `link-directive-sou`
2. Run with `dryRun: true` first, output proposed links
3. Review proposed links with Max
4. Run with `dryRun: false` after approval

### Success Criteria

- [ ] Directive → SOU links created for all valid pairs
- [ ] Zero orphan references (both documents verified to exist)
- [ ] Ambiguous matches logged for manual review
- [ ] Links verified via query showing count

---

## Phase 5.5.3: Minimal Insights MVP

**Status:** TODO  
**Owner:** Lovable (implementation), Max (approval of metrics definitions)  
**Prerequisite:** Phase 5.5.1 + 5.5.2 complete

### Goal
Deliver 2 actionable insights for Erik using validated linkage.

---

### Component 1: Organization Participation Dashboard

**Route:** `/insights/participation`

**Metrics Definitions (EXPLICIT):**

| Metric | Definition | Source |
|--------|------------|--------|
| **Response Count** | Number of `remiss_responses` linked to this entity | `remiss_responses.entity_id` |
| **Invite Count** | Number of `remiss_invitees` linked to this entity | `remiss_invitees.entity_id` |
| **Response Rate** | `Response Count / Invite Count * 100` | Calculated |
| **Uninvited Responses** | Responses where entity was NOT invited | `remiss_responses` with no matching `remiss_invitees` for same SOU |

**Display:**
- Table: Top 20 organizations by Response Count
- Bar chart: Invited vs Responded comparison
- Filter: By ministry (from parent SOU's `ministry` field)
- Filter: By year (from parent SOU's `publication_date`)

**Denominator Clarification:**
- Response Rate uses INVITES as denominator (not total SOUs)
- Organizations with 0 invites show "N/A" for response rate

---

### Component 2: Process Velocity Metrics

**Route:** `/insights/velocity`

**Metrics Definitions (EXPLICIT):**

| Metric | Definition | Source |
|--------|------------|--------|
| **Remiss Duration (days)** | `remiss_deadline - remiss_start_date` | `remiss_documents` table |
| **Average by Ministry** | Mean of Remiss Duration grouped by ministry | Aggregated |
| **Directive to Remiss (days)** | `remiss_start_date - directive.publication_date` | Requires directive→SOU link from 5.5.2 |

**Display:**
- Table: Average remiss duration by ministry
- Chart: Duration trend over time (by year)
- Note: "Directive to Remiss" only shown for SOUs with linked directives

**Edge Cases:**
- SOUs without remiss data: excluded from velocity metrics
- Missing dates: excluded from calculation, noted in UI

---

### Implementation

- New route: `/insights` (hub page with navigation)
- Sub-routes: `/insights/participation`, `/insights/velocity`
- React Query hooks for data fetching
- No new edge functions required (client-side queries via Supabase)

### Success Criteria

- [ ] Participation dashboard shows top 20 orgs with correct counts
- [ ] Response rate calculation matches defined formula
- [ ] Velocity metrics display for available processes
- [ ] Both views render without errors
- [ ] Erik confirms metrics are understandable

---

## Deferred Items (Tracked)

| Item | Future Phase | Notes |
|------|--------------|-------|
| Committee Reports + Laws | 5.4 | Defer unless pilot feedback shows explicit need |
| Remissvar Text Extraction | 6+ | `file_url` stored; add extraction columns when ready |
| Entity Co-Occurrence Network | 5.6+ | Visualization layer after core insights proven |
| Full Case Reconstruction | 6 | Requires all document types |

**Future Schema Changes (not executed now):**
```sql
-- Remissvar text extraction readiness
ALTER TABLE remiss_responses 
  ADD COLUMN IF NOT EXISTS extraction_status TEXT DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS raw_content TEXT,
  ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ;

-- Unique constraint on entities (prevent future duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_name_lower_unique 
  ON entities(name_lower) WHERE entity_type = 'organization';
```

---

## Sequencing

```
Phase 5.5.1: Reference Resolution
    ↓ (verify success criteria met, Max reviews metrics)
Phase 5.5.2: Directive-SOU Linking
    ↓ (dry-run review, explicit approval, then execute)
Phase 5.5.3: Minimal Insights MVP
    ↓ (ship to Erik for feedback)
[PAUSE for user feedback before expanding]
```

---

## Estimated Effort

| Component | Complexity | Est. Time |
|-----------|------------|-----------|
| 5.5.1: Run + analyze reference resolution | Low | 1 hour |
| 5.5.2: Directive-SOU linking function + review | Medium | 2 hours |
| 5.5.3: Participation dashboard | Low | 2 hours |
| 5.5.3: Velocity metrics | Low | 2 hours |

**Total: ~7 hours**

---

## Approval Log

| Date | Decision | Approved By |
|------|----------|-------------|
| 2026-01-16 | Phase 5.5 plan approved with refinements | Max |

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-01-16 | Initial plan created | Lovable |
| 2026-01-16 | Added explicit scope guardrails, metrics definitions | Lovable |
