-- Step 1: Remove duplicate relations (keep only the oldest by created_at)
-- This finds all duplicate relations and deletes all but the first one
DELETE FROM relations
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY source_id, target_id, relation_type
             ORDER BY created_at ASC
           ) AS rn
    FROM relations
  ) AS ranked
  WHERE rn > 1
);

-- Step 2: Add unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS ux_relations_source_target_type
ON relations (source_id, target_id, relation_type);

-- Add comment explaining the constraint
COMMENT ON INDEX ux_relations_source_target_type IS 'Ensures a relation between the same source and target with the same type can only exist once, supporting agent idempotency';