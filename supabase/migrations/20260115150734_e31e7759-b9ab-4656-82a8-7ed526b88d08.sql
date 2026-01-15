-- Step 1: Backup duplicate entities before deletion
CREATE TABLE entities_duplicates_backup_20260115 AS
SELECT * FROM entities WHERE id IN (
  SELECT unnest(entity_ids[2:]) FROM (
    SELECT array_agg(id ORDER BY created_at) as entity_ids
    FROM entities WHERE entity_type = 'organization'
    GROUP BY LOWER(name) HAVING COUNT(*) > 1
  ) t
);

-- Step 2: Update remiss_responses to point to canonical (first-created) entities
WITH duplicate_groups AS (
  SELECT 
    LOWER(name) as canonical_lower,
    array_agg(id ORDER BY created_at) as entity_ids
  FROM entities 
  WHERE entity_type = 'organization'
  GROUP BY LOWER(name)
  HAVING COUNT(*) > 1
),
merge_map AS (
  SELECT 
    entity_ids[1] as canonical_id,
    unnest(entity_ids[2:]) as duplicate_id
  FROM duplicate_groups
)
UPDATE remiss_responses rr
SET entity_id = mm.canonical_id
FROM merge_map mm
WHERE rr.entity_id = mm.duplicate_id;

-- Step 3: Delete duplicate entities (keeping the first-created canonical)
WITH duplicate_groups AS (
  SELECT 
    LOWER(name) as canonical_lower,
    array_agg(id ORDER BY created_at) as entity_ids
  FROM entities 
  WHERE entity_type = 'organization'
  GROUP BY LOWER(name)
  HAVING COUNT(*) > 1
),
duplicates_to_delete AS (
  SELECT unnest(entity_ids[2:]) as duplicate_id
  FROM duplicate_groups
)
DELETE FROM entities 
WHERE id IN (SELECT duplicate_id FROM duplicates_to_delete);