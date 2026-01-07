-- Phase 2.7: Remissinstanser & Remissvar Processing

-- 1. New table: remiss_invitees (organizations invited to respond)
CREATE TABLE remiss_invitees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remiss_id UUID NOT NULL REFERENCES remiss_documents(id) ON DELETE CASCADE,
  organization_name TEXT NOT NULL,
  entity_id UUID REFERENCES entities(id),
  invited_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  UNIQUE(remiss_id, organization_name)
);

-- RLS policies for remiss_invitees
ALTER TABLE remiss_invitees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read remiss_invitees" ON remiss_invitees
  FOR SELECT USING (true);

CREATE POLICY "Admins can insert remiss_invitees" ON remiss_invitees
  FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update remiss_invitees" ON remiss_invitees
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete remiss_invitees" ON remiss_invitees
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- 2. Add columns to remiss_responses for entity linking
ALTER TABLE remiss_responses 
  ADD COLUMN entity_id UUID REFERENCES entities(id),
  ADD COLUMN match_confidence TEXT,
  ADD COLUMN normalized_org_name TEXT;

-- 3. Indexes for analytics queries
CREATE INDEX idx_remiss_invitees_entity ON remiss_invitees(entity_id);
CREATE INDEX idx_remiss_invitees_remiss ON remiss_invitees(remiss_id);
CREATE INDEX idx_remiss_responses_entity ON remiss_responses(entity_id);
CREATE INDEX idx_remiss_responses_confidence ON remiss_responses(match_confidence);