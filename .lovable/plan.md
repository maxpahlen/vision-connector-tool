# Slice 6B.1 — Finalized Execution Plan

## Original Prompt (verbatim)

> Prepare and forward the finalized 6B.1 execution plan to Codex with updated scope, thresholds, and candidate filtering strategy

---

## Critical Scope Correction

**The previously estimated "586 AI-addressable refs" is wrong.** Deep investigation reveals:


| Category                                        | Count   | Resolution Path                                          |
| ----------------------------------------------- | ------- | -------------------------------------------------------- |
| Riksdagen codes NOT in corpus (H3xx, H4xx etc.) | 509     | Self-resolve with corpus expansion (Phase 6.1 follow-up) |
| Title-text references (true AI candidates)      | 34      | AI matching OR additional deterministic regex            |
| Protocol references (PROT)                      | 15      | Not a tracked doc type                                   |
| Riksrevisionen reports (RIR)                    | 12      | Not a tracked doc type                                   |
| Ministry dossiers                               | 11      | Not tracked (already decided)                            |
| Short codes (FPM, generic headings)             | 5       | 2 FPM (not tracked), 3 generic headings (not real refs)  |
| **True AI scope**                               | **~34** | See below                                                |


Of those 34 title-text refs, 2 contain extractable doc numbers that a minor regex fix could catch:

- `"Dir 2024:109 Tillaggsdirektiv till..."` -- missing dot in `Dir` (current regex requires `Dir.`)
- `"Tillaggsdirektiv till Miljostraffsrattsutredningen (M 2022:04)"` -- committee dossier in parentheses

The remaining ~32 are free-text Swedish titles like:

- `"Remiss av promemorian Sekretess for nya uppgifter i Schengens informationssystem"`
- `"Om lagstiftningen i Sverige"` (a generic section heading, likely not a real document ref)
- `"Tillganglighetskrav for vissa medier"`

---

## Recommendation: Downscope 6B.1

Building a full AI inference pipeline (candidate builder, classifier, gating, review queue) for **~32 title refs** is over-engineered. The cost/benefit ratio is unfavorable.

### Proposed Revised Approach

#### Step 1: Quick Deterministic Fix (6A.5b micro-hotfix)

Expand regex in `resolve-document-references` to also match `Dir` without the trailing dot (`Dir\s+\d{4}:\d+`). This catches 2 more refs deterministically.

#### Step 2: Title-Match Function (lightweight, no AI)

For the remaining ~32 title refs:

1. Decode HTML entities in `target_doc_number`
2. Normalize the decoded Swedish title
3. Use `pg_trgm` similarity (`similarity()` function, already installed) to match against `documents.title`
4. Accept matches above a similarity threshold (e.g., 0.4 for Swedish titles with HTML entity noise)
5. Write to `document_relationships` with `derived_by = 'system'` and `confidence_class = 'medium'`

This is fully deterministic (trigram similarity is a mathematical function, not AI), cheap, and testable.

#### Step 3: Manual Review of Remainder

Any title refs that fail trigram matching at threshold go into a simple report. Given the expected count (likely under 15), manual resolution by Max is faster than building an AI pipeline.

#### Step 4: Re-evaluate AI Need

If after Steps 1-3 the remaining unresolved non-motion, non-missing-corpus count exceeds 50, THEN build the AI agent. Otherwise, close 6B and move to Phase 7.

---

## Alternative: If Max Prefers Full AI Pipeline Anyway

If the decision is to build the AI pipeline regardless (for future scalability when corpus grows), here is the refined Codex plan with corrections:

### 6B.1A — Candidate Set Builder

- Pull the ~32 unresolved title-text refs (exclude motions, Riksdagen codes not in corpus, PROT, RIR, dossiers)
- For each, fetch candidate target docs via:
  - `pg_trgm` title similarity (top 20 by `similarity()`)
  - Same ministry filter
  - Overlapping year range (+/- 2 years)
- Output: candidate manifest JSON

### 6B.1B — AI Inference Classifier

- Use existing `openai-client.ts` wrapper (OPENAI_API_KEY is configured)
- Model: `gpt-4o` (via existing `callOpenAI`)
- Prompt: Given source document title/metadata and candidate list, return best match with confidence
- Output fields: `predicted_target_id`, `confidence_score`, `evidence_summary`, `decision` (accept/review/reject)
- Write results to a staging array (not production table)

### 6B.1C — Deterministic Gating

- Auto-accept: `confidence >= 0.90` AND no conflict with existing deterministic links
- Manual review: `0.70 - 0.89`
- Auto-reject: `< 0.70`
- Never overwrite `derived_by = 'resolver'` links

### 6B.1D — Persist

- Insert accepted links into `document_relationships` with:
  - `derived_by = 'agent'` (enum value already exists)
  - `confidence_class` based on score
  - `evidence_details` containing AI reasoning and `run_id`
- Rollback: `DELETE FROM document_relationships WHERE derived_by = 'agent'`

### Success Criteria

- False-positive rate < 10% on manual audit
- 100% provenance on AI-created links
- Zero deterministic link regressions
- Idempotent reruns

---

## Decision Required from Max

Given the true scope is **~32 refs** (not 586):

**Option A (Recommended):** Skip AI. Do 6A.5b regex fix + pg_trgm title match + manual remainder. Close Phase 6B. Move to Phase 7.

**Option B:** Build AI pipeline anyway for future scalability. Execute Codex's plan with corrected scope.

---

## Technical Details

### Files to Create/Modify

**Option A (lightweight):**

- `supabase/functions/resolve-document-references/index.ts` — Add `Dir` (no dot) regex variant
- New function or extension: `match-title-references` — pg_trgm similarity matching
- `docs/development/branches/phase-6-relationship-inference.md` — Update with 6B.1 closure

**Option B (full AI):**

- New: `supabase/functions/infer-document-links/index.ts` — Combined candidate builder + AI classifier
- Modify: `supabase/functions/backfill-document-relationships/index.ts` — Accept `derived_by = 'agent'` rows
- `docs/development/branches/phase-6-relationship-inference.md` — Full 6B.1 slice documentation

### Infrastructure Already in Place

- `pg_trgm` extension: installed
- `OPENAI_API_KEY` secret: configured
- `openai-client.ts` shared module: ready with retry logic
- `document_relationships` table: has `derived_by = 'agent'` enum value
- `performance-tracker.ts`: ready for metrics

#   
NOTE FROM MAX: 

I agree with Lovable that building a full AI inference pipeline (candidate builder, classifier, gating, review queue) for **~32 title refs** is over-engineered. The cost/benefit ratio is unfavorable.   
  
Let's proceed with **Option A (Recommended):** Skip AI. Do 6A.5b regex fix + pg_trgm title match + manual remainder. Close Phase 6B. Move to Phase 7.

