-- Migration: Create entity_name_rules table for allow/block list system
-- Phase 2.7: Fixes case-duplication and enables human review for short names

CREATE TABLE public.entity_name_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_lower TEXT GENERATED ALWAYS AS (LOWER(name)) STORED,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('allow', 'block')),
  reason TEXT,
  source_document_id UUID REFERENCES public.documents(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id),
  CONSTRAINT entity_name_rules_name_lower_unique UNIQUE (name_lower)
);

-- Index for fast lookups
CREATE INDEX idx_entity_name_rules_name_lower ON public.entity_name_rules (name_lower);

-- RLS: Admin-only write, authenticated read
ALTER TABLE public.entity_name_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage entity_name_rules"
  ON public.entity_name_rules FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Authenticated users can read entity_name_rules"
  ON public.entity_name_rules FOR SELECT
  USING (auth.role() = 'authenticated');

-- Seed initial known rules based on Gate 2 testing
INSERT INTO public.entity_name_rules (name, rule_type, reason) VALUES
  ('Krav', 'allow', 'KRAV organic certification body - valid 4-char mixed-case org'),
  ('Tre', 'block', 'Truncated fragment from Trelleborgs kommun'),
  ('Sve', 'block', 'Truncated fragment from Svea hovrätt or Svenska...');