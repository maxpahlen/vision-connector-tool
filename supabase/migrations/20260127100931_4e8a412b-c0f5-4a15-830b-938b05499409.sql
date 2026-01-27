-- Create table for stance keyword suggestions from manual reviews
CREATE TABLE public.stance_keyword_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  keyword TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('support', 'oppose', 'conditional', 'no_opinion')),
  source_response_id UUID REFERENCES public.remiss_responses(id) ON DELETE SET NULL,
  suggested_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_notes TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_stance_keyword_suggestions_status ON public.stance_keyword_suggestions(status);
CREATE INDEX idx_stance_keyword_suggestions_category ON public.stance_keyword_suggestions(category);

-- Unique constraint to prevent duplicate keyword suggestions
CREATE UNIQUE INDEX idx_stance_keyword_suggestions_unique 
ON public.stance_keyword_suggestions(LOWER(keyword), category) 
WHERE status != 'rejected';

-- Enable RLS
ALTER TABLE public.stance_keyword_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can read stance_keyword_suggestions"
ON public.stance_keyword_suggestions
FOR SELECT
USING (true);

CREATE POLICY "Admins can insert stance_keyword_suggestions"
ON public.stance_keyword_suggestions
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update stance_keyword_suggestions"
ON public.stance_keyword_suggestions
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete stance_keyword_suggestions"
ON public.stance_keyword_suggestions
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add comment for documentation
COMMENT ON TABLE public.stance_keyword_suggestions IS 'Stores keyword suggestions from manual stance reviews for approval before adding to stance-analyzer.ts';