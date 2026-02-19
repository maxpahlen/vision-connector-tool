import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface NetworkNode {
  id: string;
  name: string;
  entity_type: string;
  degree: number;
}

export interface NetworkEdge {
  source: string;
  target: string;
  weight: number;
  invite_count: number;
  response_count: number;
  shared_cases_count: number;
  jaccard_score: number;
}

export interface NetworkData {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  type_counts: Record<string, number>;
}

export interface NetworkFilters {
  minStrength: number;
  maxNodes: number;
  entityTypes: string[];
  entityId?: string;
}

export function useEntityNetwork(filters: NetworkFilters) {
  return useQuery<NetworkData>({
    queryKey: ['entity-network', filters],
    queryFn: async () => {
      const params: Record<string, string> = {
        min_strength: String(filters.minStrength),
        limit: String(filters.maxNodes),
      };
      if (filters.entityTypes.length > 0) {
        params.entity_types = filters.entityTypes.join(',');
      }
      if (filters.entityId) {
        params.entity_id = filters.entityId;
      }

      const queryString = new URLSearchParams(params).toString();
      const { data, error } = await supabase.functions.invoke(
        `get-entity-network?${queryString}`,
        { method: 'GET' }
      );

      if (error) throw new Error(error.message);
      return data as NetworkData;
    },
    staleTime: 60_000,
  });
}
