import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface InfluenceRecord {
  id: string;
  entity_id: string;
  influence_type: string;
  influence_score: number;
  total_submissions: number | null;
  case_count: number | null;
  calculation_date: string;
  evidence: Record<string, unknown>;
  entity_name?: string;
  entity_type?: string;
}

export interface AggregatedInfluence {
  entity_id: string;
  entity_name: string;
  entity_type: string;
  remissvar_frequency: number;
  invitation_rate: number;
  stance_consistency: number;
  cross_case_breadth: number;
  composite_score: number;
  total_submissions: number;
  case_count: number;
  evidence: Record<string, Record<string, unknown>>;
}

async function fetchInfluenceData(): Promise<AggregatedInfluence[]> {
  // Fetch all influence records for the latest calculation date
  const { data, error } = await supabase
    .from("stakeholder_influence")
    .select("*")
    .order("influence_score", { ascending: false });

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return [];

  // Cast to working type
  const records = data as unknown as InfluenceRecord[];

  // Fetch entity names
  const entityIds = [...new Set(records.map((r) => r.entity_id))];
  const { data: entities, error: entErr } = await supabase
    .from("entities")
    .select("id, name, entity_type")
    .in("id", entityIds);

  if (entErr) throw new Error(entErr.message);

  const entityMap = new Map(
    (entities || []).map((e: { id: string; name: string; entity_type: string }) => [e.id, e])
  );

  // Aggregate by entity
  const aggregated = new Map<string, AggregatedInfluence>();

  for (const record of records) {
    if (!aggregated.has(record.entity_id)) {
      const entity = entityMap.get(record.entity_id);
      aggregated.set(record.entity_id, {
        entity_id: record.entity_id,
        entity_name: entity?.name || "Okänd",
        entity_type: entity?.entity_type || "organization",
        remissvar_frequency: 0,
        invitation_rate: 0,
        stance_consistency: 0,
        cross_case_breadth: 0,
        composite_score: 0,
        total_submissions: 0,
        case_count: 0,
        evidence: {},
      });
    }

    const agg = aggregated.get(record.entity_id)!;

    switch (record.influence_type) {
      case "remissvar_frequency":
        agg.remissvar_frequency = record.influence_score;
        agg.total_submissions = record.total_submissions || 0;
        break;
      case "invitation_rate":
        agg.invitation_rate = record.influence_score;
        break;
      case "stance_consistency":
        agg.stance_consistency = record.influence_score;
        break;
      case "cross_case_breadth":
        agg.cross_case_breadth = record.influence_score;
        agg.case_count = record.case_count || 0;
        break;
    }

    agg.evidence[record.influence_type] = record.evidence as Record<string, unknown>;
  }

  // Calculate composite score (weighted average)
  for (const agg of aggregated.values()) {
    agg.composite_score = Math.round(
      (agg.remissvar_frequency * 0.35 +
        agg.invitation_rate * 0.25 +
        agg.stance_consistency * 0.15 +
        agg.cross_case_breadth * 0.25) *
        100
    ) / 100;
  }

  return [...aggregated.values()].sort((a, b) => b.composite_score - a.composite_score);
}

export function useStakeholderInfluence() {
  return useQuery({
    queryKey: ["stakeholder-influence"],
    queryFn: fetchInfluenceData,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
