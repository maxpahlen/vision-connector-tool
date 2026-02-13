# Phase 7.2 Summarizer — Status Report (2026-02-13)

## What's Done
- ✅ Database migration: `proposals_not_adopted` (JSONB) and `proposal_count` (INT) columns added
- ✅ Smart section extraction: locates Sammanfattning body (picks longest match, skips appendix)
- ✅ TOC extraction for structural context
- ✅ Prompt rewritten with negation-awareness, mandate vs proposal distinction
- ✅ Batch mode capped at 100 docs with balanced doc-type sampling
- ✅ MODEL_VERSION bumped to `gpt-4o-v3`
- ✅ Debug mode added (`mode: "debug"`) to inspect extracted text without calling AI
- ✅ Model override support (`model` param) for A/B testing
- ✅ Two-pass mode (`two_pass: true`) for difficult documents
- ✅ doc_type mismatch fixed (DB uses `directive/proposition/committee_report`, not `dir/prop/bet`)
- ✅ **Phase 7.2b: Per-type prompt system implemented**
- ✅ **All 5 document types validated with type-specific prompts**

## Phase 7.2b: Per-Type Prompt Architecture

Refactored from a single SOU-optimized prompt to `BASE_PROMPT` + `DOC_TYPE_INSTRUCTIONS[type]`.

### Semantic Field Mapping Per Doc Type

| Field | SOU / Proposition | Directive | Committee Report | Law |
|-------|-------------------|-----------|-----------------|-----|
| `core_recommendations` | Formal legislative proposals | Mandate tasks/questions | Committee positions + tillkännagivanden | Key provisions |
| `proposals_not_adopted` | Considered but rejected | Scope limitations | Reservationer (with party names) | Empty `[]` |
| `proposal_count` | Explicit count or null | Always null | # tillkännagivanden or null | null |
| `outcome_status` | pending/unknown | Always pending | enacted/rejected/pending | Always enacted |

### Per-Type Prompt Highlights

- **SOU**: Exhaustive extraction checklist (dispensregler, informationsskyldigheter, dimensioneringskrav, lagändringar). Skip mandate preamble.
- **Proposition**: Focus on "Regeringen föreslår". Note which SOU proposals were adopted vs. dropped.
- **Directive**: Mandate tasks as assignments, NOT proposals. Capture deadline (redovisningsdatum). Scope limitations.
- **Committee Report**: Committee's stance (bifall/avslag). Reservationer with party attribution. Tillkännagivanden.
- **Law**: Provisions as active law (present tense). Effective date. Transitional provisions. No "föreslår" language.

## Validation Results (v3 — Per-Type Prompts)

| Doc Type | Document | Size | Strategy | Key Quality Checks |
|----------|----------|------|----------|--------------------|
| Committee Report | HC01SkU18 (20K) | 20K full | full_text | ✅ "utskottet ställer sig bakom", outcome=enacted, Centerpartiet yttrande noted |
| Directive | Dir. 2025:103 (32K) | 32K full | full_text | ✅ 7 mandate TASKS (not proposals), proposal_count=null, outcome=pending, deadline captured |
| Law | 2024:1373 (357) | 357 full | full_text | ✅ Provisions as enacted rules, outcome=enacted, effective date noted |
| Proposition | Prop. 2025/26:73 (15K) | 15K full | full_text | ✅ "regeringen föreslår", proposal_count=2, outcome=pending |
| SOU | SOU 2025:51 (1.4M) | 18K sammanfattning | sammanfattning_with_toc | ✅ 13 proposals, ~95% coverage per ChatGPT critique |

### Quality Improvements Over v2

- **Directive**: No longer lists mandate tasks as "proposals" — uses "utredaren ska" language ✅
- **Committee Report**: Captures committee stance + reservationer ✅
- **Law**: Uses "fastställer/föreskriver" instead of "föreslår" ✅
- **Proposition**: Correctly distinguishes government proposals from background ✅

## Root Cause Found & Fixed (v1→v2)
The extraction was picking up a "Sammanfattning" heading in the **appendix (Bilaga)** instead of the actual executive summary. Fixed by iterating all matches and selecting the one with the longest body text, while skipping matches after 80% of the document.

## Model Comparison (SOU 2025:51)

| Model | proposal_count | core_recs | proposals_not_adopted | Quality |
|-------|---------------|-----------|----------------------|---------|
| gpt-4o-mini (v1 prompt) | 11 | 12 proposals | 3 items | 85-90% coverage |
| gpt-4o-mini (v2 prompt) | 11 | 13 proposals ✅ | 2 items ✅ | ~95% coverage |
| gpt-4o-2024-08-06 | 11 | 15 proposals | 3 items | Excellent |

## Cost Estimate
- gpt-4o-mini pricing: ~$0.15/1M input + $0.60/1M output
- 100 docs × ~7.5K tokens input = 750K tokens ≈ $0.11 input + ~$0.30 output = **~$0.41 total**
- Full corpus (5,490 docs): ~$22 total

## Files Modified
- `supabase/functions/generate-document-summary/index.ts` — per-type prompt system (BASE_PROMPT + DOC_TYPE_INSTRUCTIONS)
- `docs/development/PHASE_7_2_SUMMARIZER_STATUS.md` — this file

## Next Steps
1. ~~Validate on all doc types~~ ✅ Done (v3 per-type prompts)
2. Run pilot batch of 100 docs (balanced across types)
3. Generate embeddings after DeepInfra balance is topped up
