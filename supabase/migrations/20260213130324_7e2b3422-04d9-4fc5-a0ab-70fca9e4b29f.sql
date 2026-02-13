
-- Add new columns for improved summarization (Phase 7.2 fix)
ALTER TABLE public.document_summaries
  ADD COLUMN IF NOT EXISTS proposals_not_adopted jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS proposal_count integer;
