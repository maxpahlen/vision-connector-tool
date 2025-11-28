-- Phase 4.1: Add full-text search capabilities to documents table
-- Add search_vector column with weighted text search
ALTER TABLE documents 
ADD COLUMN IF NOT EXISTS search_vector tsvector 
GENERATED ALWAYS AS (
  setweight(to_tsvector('swedish', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('swedish', coalesce(doc_number, '')), 'B') ||
  setweight(to_tsvector('swedish', coalesce(raw_content, '')), 'C')
) STORED;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_documents_search_vector 
ON documents USING GIN(search_vector);

-- Add indexes for faceted filtering
CREATE INDEX IF NOT EXISTS idx_documents_ministry 
ON documents(ministry) WHERE ministry IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_publication_date 
ON documents(publication_date) WHERE publication_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_doc_type 
ON documents(doc_type);

-- Add index on processes.current_stage for stage filtering
CREATE INDEX IF NOT EXISTS idx_processes_current_stage 
ON processes(current_stage);