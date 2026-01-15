-- Add a generated column for normalized lowercase name
ALTER TABLE entities 
ADD COLUMN name_lower TEXT GENERATED ALWAYS AS (LOWER(name)) STORED;

-- Add unique constraint for organization entities only
CREATE UNIQUE INDEX idx_entities_org_name_unique 
ON entities (name_lower) 
WHERE entity_type = 'organization';