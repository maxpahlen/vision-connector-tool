# Phase 7.2 Summarizer — Status Report (2026-02-13)

## What's Done
- ✅ Database migration: `proposals_not_adopted` (JSONB) and `proposal_count` (INT) columns added
- ✅ Smart section extraction: locates Sammanfattning body (picks longest match, skips appendix)
- ✅ TOC extraction for structural context
- ✅ Prompt rewritten with negation-awareness, mandate vs proposal distinction
- ✅ Batch mode capped at 100 docs with balanced doc-type sampling
- ✅ MODEL_VERSION bumped to `gpt-4o-v2`
- ✅ Debug mode added (`mode: "debug"`) to inspect extracted text without calling AI
- ✅ Model override support (`model` param) for A/B testing
- ✅ Two-pass mode (`two_pass: true`) for difficult documents

## Root Cause Found & Fixed
The extraction was picking up a "Sammanfattning" heading in the **appendix (Bilaga)** instead of the actual executive summary. Fixed by iterating all matches and selecting the one with the longest body text, while skipping matches after 80% of the document.

## Model Comparison (SOU 2025:51)

| Model | proposal_count | core_recs | proposals_not_adopted | Quality |
|-------|---------------|-----------|----------------------|---------|
| gpt-4o-mini | 11 ✅ | 12 specific proposals ✅ | 3 items ✅ | Excellent |
| gpt-4o-2024-08-06 | 11 ✅ | 15 specific proposals ✅ | 3 items ✅ | Excellent |

Both models correctly:
- Set proposal_count to 11 (matches "Vi lämnar elva förslag")
- Listed strandskydd, ledningsrätt, VA-huvudman, medfinansiering, bygglov, markreservat
- Put "samordningsansvar" under proposals_not_adopted
- Put "nationella riktlinjer" under proposals_not_adopted
- Zero mandate tasks in core_recommendations

**Default model set to gpt-4o-mini** (10x cheaper, comparable quality).

## Cost Estimate (Updated)
- gpt-4o-mini pricing: ~$0.15/1M input + $0.60/1M output
- 100 docs × ~7.5K tokens input = 750K tokens ≈ $0.11 input + ~$0.30 output = **~$0.41 total**
- Full corpus (5,490 docs): ~$22 total

## Files Modified
- `supabase/functions/generate-document-summary/index.ts` — section extraction fix + model support
- `docs/development/PHASE_7_2_SUMMARIZER_STATUS.md` — this file

## Next Steps
1. Validate on 2-3 more documents from different types (proposition, directive)
2. Run pilot batch of 100 docs (balanced across types)
3. Re-run ChatGPT critique on the new SOU 2025:51 summary
4. Generate embeddings after DeepInfra balance is topped up
