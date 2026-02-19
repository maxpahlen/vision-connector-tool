import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EntityNeighbor {
  id: string;
  name: string;
  entity_type: string;
  shared_cases_count: number;
  jaccard_score: number;
  invite_count: number;
  response_count: number;
}

export function useEntityNeighbors(entityId: string | undefined, limit = 10) {
  return useQuery<EntityNeighbor[]>({
    queryKey: ['entity-neighbors', entityId, limit],
    queryFn: async () => {
      if (!entityId) return [];

      // Fetch co-occurrence rows where this entity is either side
      const { data: rows, error } = await supabase
        .from('entity_cooccurrence')
        .select('entity_a_id, entity_b_id, total_shared_case_count, jaccard_score, invite_cooccurrence_count, response_cooccurrence_count, relationship_strength')
        .or(`entity_a_id.eq.${entityId},entity_b_id.eq.${entityId}`)
        .order('relationship_strength', { ascending: false })
        .limit(limit);

      if (error) throw new Error(error.message);
      if (!rows || rows.length === 0) return [];

      // Collect neighbor IDs
      const neighborIds = rows.map(r =>
        r.entity_a_id === entityId ? r.entity_b_id : r.entity_a_id
      );

      // Fetch entity details
      const { data: entities, error: entErr } = await supabase
        .from('entities')
        .select('id, name, entity_type')
        .in('id', neighborIds);

      if (entErr) throw new Error(entErr.message);

      const entityMap = new Map((entities ?? []).map(e => [e.id, e]));

      return rows
        .map(r => {
          const neighborId = r.entity_a_id === entityId ? r.entity_b_id : r.entity_a_id;
          const entity = entityMap.get(neighborId);
          if (!entity) return null;
          return {
            id: entity.id,
            name: entity.name,
            entity_type: entity.entity_type,
            shared_cases_count: r.total_shared_case_count,
            jaccard_score: r.jaccard_score ?? 0,
            invite_count: r.invite_cooccurrence_count,
            response_count: r.response_cooccurrence_count,
          };
        })
        .filter(Boolean) as EntityNeighbor[];
    },
    enabled: !!entityId,
    staleTime: 60_000,
  });
}
