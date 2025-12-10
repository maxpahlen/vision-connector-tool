-- Add unique constraint to enable ON CONFLICT upsert for document_references
ALTER TABLE document_references
ADD CONSTRAINT document_references_source_target_unique 
UNIQUE (source_document_id, target_doc_number);