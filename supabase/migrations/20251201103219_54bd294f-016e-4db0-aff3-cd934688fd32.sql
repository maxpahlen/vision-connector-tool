-- Enable pg_trgm extension for faster fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add trigram index on entities.name for faster autocomplete search
CREATE INDEX IF NOT EXISTS idx_entities_name_trgm ON entities USING gin (name gin_trgm_ops);

-- Add comment explaining the index
COMMENT ON INDEX idx_entities_name_trgm IS 'Trigram index for fast fuzzy search on entity names in autocomplete';