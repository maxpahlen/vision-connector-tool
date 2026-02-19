
-- Slice 7.4: Entity Co-Occurrence Networks
-- Stores pairwise co-occurrence between entities that appear in the same remiss process
-- Co-occurrence is counted ONCE per remiss per pair (deduplicated)

CREATE TABLE public.entity_cooccurrence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_a_id UUID NOT NULL REFERENCES public.entities(id),
  entity_b_id UUID NOT NULL REFERENCES public.entities(id),
  invite_cooccurrence_count INTEGER NOT NULL DEFAULT 0,
  response_cooccurrence_count INTEGER NOT NULL DEFAULT 0,
  cooccurrence_count INTEGER NOT NULL DEFAULT 0,  -- distinct remiss pair count (may differ from max of invite/response due to dedup)
  jaccard_score NUMERIC(5,4) CHECK (jaccard_score >= 0 AND jaccard_score <= 1),
  relationship_strength NUMERIC(3,2) CHECK (relationship_strength >= 0 AND relationship_strength <= 1),
  shared_cases UUID[] DEFAULT '{}',  -- capped at 100 most recent remiss_document IDs
  total_shared_case_count INTEGER NOT NULL DEFAULT 0,  -- uncapped true count
  first_cooccurrence_date DATE,
  last_cooccurrence_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT canonical_pair_order CHECK (entity_a_id < entity_b_id),
  CONSTRAINT unique_entity_pair UNIQUE (entity_a_id, entity_b_id)
);

-- Indexes for query patterns
CREATE INDEX idx_cooccurrence_entity_a_strength ON public.entity_cooccurrence (entity_a_id, relationship_strength DESC);
CREATE INDEX idx_cooccurrence_entity_b_strength ON public.entity_cooccurrence (entity_b_id, relationship_strength DESC);
CREATE INDEX idx_cooccurrence_strength_updated ON public.entity_cooccurrence (relationship_strength DESC, updated_at DESC);

-- Enable RLS
ALTER TABLE public.entity_cooccurrence ENABLE ROW LEVEL SECURITY;

-- Admin write policies
CREATE POLICY "Admins can insert entity_cooccurrence"
  ON public.entity_cooccurrence FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update entity_cooccurrence"
  ON public.entity_cooccurrence FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete entity_cooccurrence"
  ON public.entity_cooccurrence FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Authenticated read
CREATE POLICY "Authenticated users read entity_cooccurrence"
  ON public.entity_cooccurrence FOR SELECT
  USING (true);
