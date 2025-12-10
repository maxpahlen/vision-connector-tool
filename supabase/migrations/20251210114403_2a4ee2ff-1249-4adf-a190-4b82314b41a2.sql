-- Phase 5.3: Remisser + Remissvar tables

-- Table to track remiss pages linked to SOUs
CREATE TABLE public.remiss_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  remiss_page_url TEXT NOT NULL UNIQUE,
  remissinstanser_pdf_url TEXT,
  title TEXT,
  remiss_deadline DATE,
  status TEXT DEFAULT 'pending', -- pending, scraped, failed
  remissvar_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table to track individual remissvar responses
CREATE TABLE public.remiss_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remiss_id UUID NOT NULL REFERENCES remiss_documents(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL, -- Link to documents table if stored
  file_url TEXT NOT NULL,
  filename TEXT,
  responding_organization TEXT,
  file_type TEXT DEFAULT 'pdf', -- pdf, word, excel, other
  status TEXT DEFAULT 'pending', -- pending, processed, skipped_non_pdf
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(remiss_id, file_url)
);

-- Enable RLS
ALTER TABLE public.remiss_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.remiss_responses ENABLE ROW LEVEL SECURITY;

-- RLS policies for remiss_documents
CREATE POLICY "Authenticated users read remiss_documents"
  ON public.remiss_documents FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert remiss_documents"
  ON public.remiss_documents FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update remiss_documents"
  ON public.remiss_documents FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete remiss_documents"
  ON public.remiss_documents FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for remiss_responses
CREATE POLICY "Authenticated users read remiss_responses"
  ON public.remiss_responses FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert remiss_responses"
  ON public.remiss_responses FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update remiss_responses"
  ON public.remiss_responses FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete remiss_responses"
  ON public.remiss_responses FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Indexes for performance
CREATE INDEX idx_remiss_documents_parent ON remiss_documents(parent_document_id);
CREATE INDEX idx_remiss_documents_status ON remiss_documents(status);
CREATE INDEX idx_remiss_responses_remiss ON remiss_responses(remiss_id);
CREATE INDEX idx_remiss_responses_organization ON remiss_responses(responding_organization);

-- Add lifecycle_stage value for remissvar to documents if not already present
-- (This is handled by CHECK constraint update or application logic)