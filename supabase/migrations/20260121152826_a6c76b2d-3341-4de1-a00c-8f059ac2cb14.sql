-- Phase 5.6.1: Remissvar Text Extraction Infrastructure
-- Adds columns for storing extracted PDF text and tracking extraction status

-- Add extraction status column with index for batch processing
ALTER TABLE public.remiss_responses 
  ADD COLUMN IF NOT EXISTS extraction_status TEXT DEFAULT 'not_started';

-- Add raw content column for storing extracted text
ALTER TABLE public.remiss_responses 
  ADD COLUMN IF NOT EXISTS raw_content TEXT;

-- Add timestamp for tracking when extraction occurred
ALTER TABLE public.remiss_responses 
  ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ;

-- Create index for efficient batch queries by extraction status
CREATE INDEX IF NOT EXISTS idx_remiss_responses_extraction_status 
  ON public.remiss_responses(extraction_status);

-- Add comment explaining extraction_status values
COMMENT ON COLUMN public.remiss_responses.extraction_status IS 
  'Extraction status: not_started | pending | ok | error | skipped';