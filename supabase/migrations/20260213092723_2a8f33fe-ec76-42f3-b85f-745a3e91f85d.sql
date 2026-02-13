
-- ============================================================
-- Slice 6A.4: document_relationships M2M schema
-- Evidence contract for evidence_details JSONB:
--   {
--     "evidence_type": string (required),     -- e.g. "explicit_reference", "shared_entity", "directive_number_match"
--     "evidence_excerpt": string | null,       -- source text excerpt
--     "matched_fields": string[],              -- e.g. ["doc_number", "ministry"]
--     "rule_version": string                   -- e.g. "resolver-v1", "agent-v1"
--   }
-- ============================================================

-- 1. Constrained types
CREATE TYPE public.relationship_type AS ENUM (
  'proposition_to_committee_report',
  'committee_report_to_proposition',
  'sou_to_proposition',
  'directive_to_sou',
  'proposition_to_law',
  'remiss_to_sou',
  'references'
);

CREATE TYPE public.confidence_class AS ENUM ('high', 'medium', 'low');

CREATE TYPE public.derived_by_source AS ENUM ('system', 'resolver', 'agent', 'manual');

-- 2. Table
CREATE TABLE public.document_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  target_document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  relationship_type public.relationship_type NOT NULL,
  confidence_score NUMERIC(4,3) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  confidence_class public.confidence_class NOT NULL,
  evidence_details JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Provenance columns
  source_reference_id UUID NULL REFERENCES public.document_references(id) ON DELETE SET NULL,
  source_process_id UUID NULL REFERENCES public.processes(id) ON DELETE SET NULL,
  derived_by public.derived_by_source NOT NULL DEFAULT 'system',

  -- Canonical pair for symmetric dedup (generated)
  canonical_source_id UUID GENERATED ALWAYS AS (LEAST(source_document_id, target_document_id)) STORED,
  canonical_target_id UUID GENERATED ALWAYS AS (GREATEST(source_document_id, target_document_id)) STORED,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Self-reference guard
  CONSTRAINT no_self_reference CHECK (source_document_id != target_document_id),

  -- Directed uniqueness (all types)
  CONSTRAINT uq_directed UNIQUE (source_document_id, target_document_id, relationship_type)
);

-- 3. Symmetric dedup: unique on canonical pair for 'references' type
CREATE UNIQUE INDEX uq_symmetric_references
  ON public.document_relationships (canonical_source_id, canonical_target_id, relationship_type)
  WHERE relationship_type = 'references';

-- 4. Query indexes
CREATE INDEX idx_dr_source ON public.document_relationships (source_document_id);
CREATE INDEX idx_dr_target ON public.document_relationships (target_document_id);
CREATE INDEX idx_dr_type ON public.document_relationships (relationship_type);
CREATE INDEX idx_dr_type_confidence ON public.document_relationships (relationship_type, confidence_score DESC);
CREATE INDEX idx_dr_source_ref ON public.document_relationships (source_reference_id) WHERE source_reference_id IS NOT NULL;

-- 5. RLS
ALTER TABLE public.document_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read document_relationships"
  ON public.document_relationships FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert document_relationships"
  ON public.document_relationships FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update document_relationships"
  ON public.document_relationships FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete document_relationships"
  ON public.document_relationships FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
