-- Add target_url column to store remiss URLs extracted from Lagstiftningskedjan
ALTER TABLE document_references ADD COLUMN IF NOT EXISTS target_url TEXT;

-- Create index for efficient Phase A lookups by URL pattern
CREATE INDEX IF NOT EXISTS idx_doc_refs_target_url ON document_references (target_url);

-- Create partial index specifically for remiss URLs (for Phase A performance)
CREATE INDEX IF NOT EXISTS idx_doc_refs_remiss_urls ON document_references (target_url) 
WHERE target_url LIKE '%/remisser/%';