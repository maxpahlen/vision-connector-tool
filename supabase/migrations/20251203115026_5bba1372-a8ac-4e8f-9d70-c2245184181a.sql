-- Add metadata column to timeline_events for structured event details
ALTER TABLE timeline_events
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Index for efficient JSONB queries on metadata
CREATE INDEX IF NOT EXISTS idx_timeline_events_metadata_gin
ON timeline_events
USING GIN (metadata);

COMMENT ON COLUMN timeline_events.metadata IS 'Structured metadata for event details: committee roles (committee_event_kind, role, person_name), deadline info (deadline_kind, deadline_index, deadline_label)';