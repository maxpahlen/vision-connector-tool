
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Create document_summaries table
CREATE TABLE public.document_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) UNIQUE,
  summary_text TEXT NOT NULL,
  policy_aim TEXT,
  core_recommendations JSONB DEFAULT '[]'::jsonb,
  key_actors JSONB DEFAULT '[]'::jsonb,
  policy_domains TEXT[] DEFAULT '{}',
  keywords TEXT[] DEFAULT '{}',
  outcome_status TEXT, -- 'enacted', 'rejected', 'pending', 'superseded', 'unknown'
  embedding vector(1024),
  model_version TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_summaries_document ON public.document_summaries(document_id);
CREATE INDEX idx_summaries_keywords ON public.document_summaries USING GIN (keywords);
CREATE INDEX idx_summaries_domains ON public.document_summaries USING GIN (policy_domains);
CREATE INDEX idx_summaries_model ON public.document_summaries(model_version);
CREATE INDEX idx_summaries_outcome ON public.document_summaries(outcome_status);

-- IVFFlat index on embedding (requires some data first, so create with low lists count initially)
-- Will be recreated with proper lists count after initial data load
CREATE INDEX idx_summaries_embedding ON public.document_summaries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Enable RLS
ALTER TABLE public.document_summaries ENABLE ROW LEVEL SECURITY;

-- RLS policies (same pattern as other tables)
CREATE POLICY "Authenticated users read document_summaries"
  ON public.document_summaries FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert document_summaries"
  ON public.document_summaries FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update document_summaries"
  ON public.document_summaries FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete document_summaries"
  ON public.document_summaries FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_document_summaries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_document_summaries_updated_at
  BEFORE UPDATE ON public.document_summaries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_document_summaries_updated_at();
