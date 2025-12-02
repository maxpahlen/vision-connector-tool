-- Phase 5: Legislative Graph Expansion - Database Schema Changes

-- 1. Add lifecycle_stage column to documents
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS lifecycle_stage TEXT
CHECK (lifecycle_stage IN (
  'directive',
  'interim_analysis',
  'remiss',
  'proposition',
  'parliament',
  'law'
));

-- Add index for lifecycle_stage filtering
CREATE INDEX IF NOT EXISTS idx_documents_lifecycle_stage ON documents(lifecycle_stage);

-- 2. Add external_urls JSONB column to documents
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS external_urls JSONB DEFAULT '[]'::jsonb;

-- 3. Create document_references table for document-to-document citations
CREATE TABLE IF NOT EXISTS document_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  target_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  target_doc_number TEXT,
  reference_type TEXT NOT NULL,
  source_page INTEGER,
  source_excerpt TEXT,
  confidence TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_doc_refs_source ON document_references(source_document_id);
CREATE INDEX IF NOT EXISTS idx_doc_refs_target ON document_references(target_document_id);
CREATE INDEX IF NOT EXISTS idx_doc_refs_target_number ON document_references(target_doc_number);
CREATE INDEX IF NOT EXISTS idx_doc_refs_type ON document_references(reference_type);

-- Enable RLS on document_references
ALTER TABLE document_references ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Authenticated users can read document_references
CREATE POLICY "Authenticated users read document_references"
ON document_references FOR SELECT
USING (true);

-- RLS Policy: Admins can insert document_references (via edge functions with service role)
CREATE POLICY "Admins can insert document_references"
ON document_references FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policy: Admins can update document_references
CREATE POLICY "Admins can update document_references"
ON document_references FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS Policy: Admins can delete document_references
CREATE POLICY "Admins can delete document_references"
ON document_references FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));