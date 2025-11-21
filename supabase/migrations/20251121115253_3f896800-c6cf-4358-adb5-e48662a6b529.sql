-- ============================================
-- Phase 3.1: Citation Schema Enhancements
-- ============================================
--
-- Add NOT NULL constraints for citations on timeline_events
-- Add citation fields to entities and relations tables
--

-- 1. Update timeline_events: Add NOT NULL constraints for citations
-- (Only for NEW events - existing events without citations are allowed)
-- We use a CHECK constraint that allows NULL OR requires both fields together

ALTER TABLE timeline_events 
  ADD CONSTRAINT timeline_events_citation_check 
  CHECK (
    (source_page IS NULL AND source_excerpt IS NULL) OR
    (source_page IS NOT NULL AND source_excerpt IS NOT NULL)
  );

COMMENT ON CONSTRAINT timeline_events_citation_check ON timeline_events IS 
  'Ensures that citations are complete: either both source_page and source_excerpt are provided, or neither';


-- 2. Add citation fields to entities table
-- Store where each entity was first mentioned/discovered
ALTER TABLE entities 
  ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_page integer,
  ADD COLUMN IF NOT EXISTS source_excerpt text;

COMMENT ON COLUMN entities.source_document_id IS 'Document where this entity was first discovered';
COMMENT ON COLUMN entities.source_page IS 'Page number where entity was first mentioned';
COMMENT ON COLUMN entities.source_excerpt IS 'Quote/excerpt from document mentioning this entity';


-- 3. Enhance relations table with citation metadata
-- Relations already have a metadata JSONB field, but we add structured citation fields
ALTER TABLE relations
  ADD COLUMN IF NOT EXISTS source_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_page integer,
  ADD COLUMN IF NOT EXISTS source_excerpt text;

COMMENT ON COLUMN relations.source_document_id IS 'Document establishing this relationship';
COMMENT ON COLUMN relations.source_page IS 'Page number where relationship was mentioned';
COMMENT ON COLUMN relations.source_excerpt IS 'Quote/excerpt supporting this relationship';


-- 4. Add index for citation-based queries
CREATE INDEX IF NOT EXISTS idx_timeline_events_citations 
  ON timeline_events(process_id, source_page) 
  WHERE source_page IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_entities_citations 
  ON entities(source_document_id, source_page) 
  WHERE source_document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_relations_citations 
  ON relations(source_document_id, source_page) 
  WHERE source_document_id IS NOT NULL;


-- 5. Create view for citation quality monitoring
CREATE OR REPLACE VIEW citation_quality AS
SELECT 
  'timeline_events' as table_name,
  COUNT(*) as total_records,
  COUNT(source_page) as records_with_page,
  COUNT(source_excerpt) as records_with_excerpt,
  ROUND(100.0 * COUNT(source_page) / NULLIF(COUNT(*), 0), 2) as citation_coverage_pct
FROM timeline_events
WHERE created_at > '2025-01-01' -- Only count recent AI-generated events

UNION ALL

SELECT 
  'entities' as table_name,
  COUNT(*) as total_records,
  COUNT(source_page) as records_with_page,
  COUNT(source_excerpt) as records_with_excerpt,
  ROUND(100.0 * COUNT(source_page) / NULLIF(COUNT(*), 0), 2) as citation_coverage_pct
FROM entities
WHERE created_at > '2025-01-01'

UNION ALL

SELECT 
  'relations' as table_name,
  COUNT(*) as total_records,
  COUNT(source_page) as records_with_page,
  COUNT(source_excerpt) as records_with_excerpt,
  ROUND(100.0 * COUNT(source_page) / NULLIF(COUNT(*), 0), 2) as citation_coverage_pct
FROM relations
WHERE created_at > '2025-01-01';

COMMENT ON VIEW citation_quality IS 'Monitor citation coverage for AI-generated data (forensic quality metric)';
