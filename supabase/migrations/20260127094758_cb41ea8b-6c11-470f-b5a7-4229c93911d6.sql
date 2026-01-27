-- Phase 5.6.3: Stance Detection Schema Extension
-- Adds columns for keyword-based stance analysis results

ALTER TABLE remiss_responses 
  ADD COLUMN IF NOT EXISTS stance_summary TEXT,
  ADD COLUMN IF NOT EXISTS stance_signals JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS analysis_status TEXT DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

-- Index for batch processing (only analyze extracted responses)
CREATE INDEX IF NOT EXISTS idx_remiss_responses_analysis_status 
  ON remiss_responses(analysis_status);

-- Composite index for efficient querying of analysis-eligible rows
CREATE INDEX IF NOT EXISTS idx_remiss_responses_extraction_analysis 
  ON remiss_responses(extraction_status, analysis_status);

-- Comments for documentation
COMMENT ON COLUMN remiss_responses.stance_summary IS 
  'Overall stance: support, oppose, conditional, neutral, mixed';
COMMENT ON COLUMN remiss_responses.stance_signals IS 
  'Detailed match data: {support_count, oppose_count, conditional_count, no_opinion_count, keywords_found, section_context}';
COMMENT ON COLUMN remiss_responses.analysis_status IS 
  'Processing state: not_started, ok, error, skipped. Only runs when extraction_status = ok';
COMMENT ON COLUMN remiss_responses.analyzed_at IS 
  'Timestamp when stance analysis was completed';