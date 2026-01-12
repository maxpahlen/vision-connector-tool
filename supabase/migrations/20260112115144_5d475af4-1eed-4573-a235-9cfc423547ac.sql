-- Scoped reset of remiss_responses linking fields
-- Clears entity_id, match_confidence, and normalized_org_name to establish clean baseline
-- before re-running linking with fixed matcher logic

UPDATE remiss_responses
SET 
  entity_id = NULL,
  match_confidence = NULL,
  normalized_org_name = NULL
WHERE entity_id IS NOT NULL 
   OR match_confidence IS NOT NULL
   OR normalized_org_name IS NOT NULL;