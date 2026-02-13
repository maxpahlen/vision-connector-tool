# Phase 7.2 Summarizer — Status Report (2026-02-13)

## What's Done
- ✅ Database migration: `proposals_not_adopted` (JSONB) and `proposal_count` (INT) columns added
- ✅ Smart section extraction implemented: locates Sammanfattning body, extracts TOC for context
- ✅ Extraction verified: SOU 2025:51 correctly extracts ~18K chars of Sammanfattning + TOC
- ✅ Prompt updated with negation-awareness, mandate vs proposal distinction
- ✅ Batch mode capped at 100 docs with balanced doc-type sampling
- ✅ MODEL_VERSION bumped to `gpt-4o-v2`

## Open Issue: Model Output Quality
Despite correct extraction (full Sammanfattning body is sent), GPT-4o-2024-08-06 still produces mandate-level summaries rather than extracting the 11 specific proposals listed in the text.

### Evidence
The Sammanfattning text explicitly says "Vi lämnar elva förslag till förändringar i befintlig lagstiftning" and then lists them (strandskydd, ledningsrätt, VA-huvudman, medfinansiering, etc.), but the model outputs generic items like "Utveckla nya finansieringsmodeller" instead of the specific proposals.

### Possible Next Steps
1. **Try a different model** — GPT-4o-mini might actually follow instructions more literally, or try GPT-4-turbo
2. **Add few-shot examples** in the system prompt showing correct vs incorrect extraction
3. **Two-pass approach**: first extract a bullet list of proposals, then summarize
4. **Structured extraction**: use function calling / tool_use to force the model to fill each field separately

## Files Modified
- `supabase/functions/generate-document-summary/index.ts` — complete rewrite with section extraction
- `supabase/migrations/` — added proposals_not_adopted and proposal_count columns
