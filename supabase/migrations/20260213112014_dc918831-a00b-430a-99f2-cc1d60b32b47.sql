-- Slice 7.1: Stakeholder Influence Analytics
-- Per-organization influence scores with evidence traceability

CREATE TABLE public.stakeholder_influence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  influence_type TEXT NOT NULL, -- 'remissvar_frequency', 'invitation_rate', 'stance_consistency', 'cross_case_breadth'
  influence_score NUMERIC(5,2) NOT NULL, -- 0.00 to 100.00
  total_submissions INTEGER,
  case_count INTEGER,
  calculation_date DATE NOT NULL,
  evidence JSONB DEFAULT '{}', -- { "cases": [...], "remissvar_ids": [...], "methodology": "..." }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(entity_id, influence_type, calculation_date)
);

-- Indexes for dashboard queries
CREATE INDEX idx_influence_entity ON public.stakeholder_influence(entity_id);
CREATE INDEX idx_influence_score ON public.stakeholder_influence(influence_score DESC);
CREATE INDEX idx_influence_date ON public.stakeholder_influence(calculation_date DESC);
CREATE INDEX idx_influence_type ON public.stakeholder_influence(influence_type);

-- Enable RLS
ALTER TABLE public.stakeholder_influence ENABLE ROW LEVEL SECURITY;

-- RLS policies: admin write, authenticated read (consistent with existing pattern)
CREATE POLICY "Admins can insert stakeholder_influence"
  ON public.stakeholder_influence FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update stakeholder_influence"
  ON public.stakeholder_influence FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete stakeholder_influence"
  ON public.stakeholder_influence FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users read stakeholder_influence"
  ON public.stakeholder_influence FOR SELECT
  USING (true);

-- Materialized view for dashboard performance
CREATE MATERIALIZED VIEW public.mv_top_influencers AS
SELECT 
  si.entity_id,
  e.name AS entity_name,
  e.entity_type,
  si.influence_type,
  si.influence_score,
  si.total_submissions,
  si.case_count,
  si.calculation_date
FROM public.stakeholder_influence si
JOIN public.entities e ON si.entity_id = e.id
WHERE si.calculation_date = (
  SELECT MAX(calculation_date) FROM public.stakeholder_influence
)
ORDER BY si.influence_score DESC;

CREATE INDEX idx_mv_influencers_score ON public.mv_top_influencers(influence_score DESC);
CREATE INDEX idx_mv_influencers_type ON public.mv_top_influencers(influence_type);