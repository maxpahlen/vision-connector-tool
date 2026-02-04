-- Phase 1.3: Backfill lifecycle_stage for directives with NULL values
-- Per Fix Execution Report Phase 1.3

UPDATE documents 
SET lifecycle_stage = 'directive' 
WHERE doc_type = 'directive' 
AND lifecycle_stage IS NULL;