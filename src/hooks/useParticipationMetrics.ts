import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface OrganizationMetrics {
  entity_id: string;
  entity_name: string;
  response_count: number;
  invite_count: number;
  response_rate: number | null; // null if never invited
  uninvited_responses: number;
}

export interface ParticipationSummary {
  total_responses: number;
  total_invites: number;
  total_entities: number;
  overall_response_rate: number;
  organizations: OrganizationMetrics[];
}

export function useParticipationMetrics(limit = 50) {
  return useQuery({
    queryKey: ["participation-metrics", limit],
    queryFn: async (): Promise<ParticipationSummary> => {
      const { data, error } = await supabase.functions.invoke(
        "get-participation-metrics",
        {
          body: null,
          method: "GET",
        }
      );

      if (error) throw error;
      
      // The edge function returns the full result, apply limit client-side for flexibility
      return {
        ...data,
        organizations: data.organizations?.slice(0, limit) || [],
      };
    },
    staleTime: 60000, // 1 minute
  });
}
