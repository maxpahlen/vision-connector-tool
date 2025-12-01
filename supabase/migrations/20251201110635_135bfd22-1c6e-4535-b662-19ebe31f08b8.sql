-- Safety checks: verify no dangling references exist
DO $$
DECLARE
  dangling_targets INTEGER;
  dangling_sources INTEGER;
BEGIN
  -- Check for target_ids that don't point to existing documents
  SELECT COUNT(*) INTO dangling_targets
  FROM relations
  WHERE target_id NOT IN (SELECT id FROM documents);
  
  -- Check for source_ids that don't point to existing entities
  SELECT COUNT(*) INTO dangling_sources
  FROM relations
  WHERE source_id NOT IN (SELECT id FROM entities);
  
  IF dangling_targets > 0 THEN
    RAISE EXCEPTION 'Found % dangling target_id references in relations table', dangling_targets;
  END IF;
  
  IF dangling_sources > 0 THEN
    RAISE EXCEPTION 'Found % dangling source_id references in relations table', dangling_sources;
  END IF;
  
  RAISE NOTICE 'Safety checks passed: no dangling references found';
END $$;

-- Add foreign key constraints with CASCADE delete
-- CASCADE is appropriate here because relations are dependent on their source/target entities
-- If an entity or document is deleted, the relation becomes meaningless
ALTER TABLE relations 
  ADD CONSTRAINT relations_source_id_fkey
    FOREIGN KEY (source_id)
    REFERENCES entities(id)
    ON DELETE CASCADE;

ALTER TABLE relations 
  ADD CONSTRAINT relations_target_id_fkey
    FOREIGN KEY (target_id)
    REFERENCES documents(id)
    ON DELETE CASCADE;

-- Add indexes for efficient lookups (if they don't already exist)
CREATE INDEX IF NOT EXISTS idx_relations_source_id ON relations(source_id);
CREATE INDEX IF NOT EXISTS idx_relations_target_id ON relations(target_id);
CREATE INDEX IF NOT EXISTS idx_relations_source_target ON relations(source_id, target_id);

-- Add comments for documentation
COMMENT ON CONSTRAINT relations_source_id_fkey ON relations IS 
  'FK to entities: ensures source_id always points to a valid entity';
COMMENT ON CONSTRAINT relations_target_id_fkey ON relations IS 
  'FK to documents: ensures target_id always points to a valid document';
COMMENT ON INDEX idx_relations_source_id IS 
  'Index for fast lookup of all relations from a given entity';
COMMENT ON INDEX idx_relations_target_id IS 
  'Index for fast lookup of all relations to a given document';
COMMENT ON INDEX idx_relations_source_target IS 
  'Composite index for join performance and uniqueness checks';