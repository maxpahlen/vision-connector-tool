-- Phase 1: Reset to Clean State
-- Truncate all content tables while preserving schema, indices, and edge functions
-- CASCADE handles foreign key constraints automatically

TRUNCATE TABLE 
  remiss_responses,
  remiss_documents,
  relations,
  timeline_events,
  process_documents,
  agent_tasks,
  document_references,
  entities,
  processes,
  documents
RESTART IDENTITY CASCADE;