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
      // Fetch responses grouped by entity
      const { data: responsesByEntity, error: respError } = await supabase
        .from("remiss_responses")
        .select("entity_id, remiss_id")
        .not("entity_id", "is", null);

      if (respError) throw respError;

      // Fetch invites grouped by entity
      const { data: invitesByEntity, error: invError } = await supabase
        .from("remiss_invitees")
        .select("entity_id, remiss_id")
        .not("entity_id", "is", null);

      if (invError) throw invError;

      // Fetch entity names
      const { data: entities, error: entError } = await supabase
        .from("entities")
        .select("id, name")
        .eq("entity_type", "organization");

      if (entError) throw entError;

      const entityNameMap = new Map(entities?.map((e) => [e.id, e.name]) || []);

      // Aggregate responses by entity
      const responseMap = new Map<string, Set<string>>();
      responsesByEntity?.forEach((r) => {
        if (!r.entity_id) return;
        if (!responseMap.has(r.entity_id)) {
          responseMap.set(r.entity_id, new Set());
        }
        responseMap.get(r.entity_id)!.add(r.remiss_id);
      });

      // Aggregate invites by entity with remiss_id tracking
      const inviteMap = new Map<string, Set<string>>();
      invitesByEntity?.forEach((i) => {
        if (!i.entity_id) return;
        if (!inviteMap.has(i.entity_id)) {
          inviteMap.set(i.entity_id, new Set());
        }
        inviteMap.get(i.entity_id)!.add(i.remiss_id);
      });

      // Combine all entity IDs
      const allEntityIds = new Set([
        ...responseMap.keys(),
        ...inviteMap.keys(),
      ]);

      // Calculate metrics for each organization
      const organizations: OrganizationMetrics[] = [];
      
      allEntityIds.forEach((entityId) => {
        const responseRemisser = responseMap.get(entityId) || new Set();
        const inviteRemisser = inviteMap.get(entityId) || new Set();
        
        const responseCount = responseRemisser.size;
        const inviteCount = inviteRemisser.size;
        
        // Uninvited responses: responded to remiss but wasn't on invite list
        let uninvitedResponses = 0;
        responseRemisser.forEach((remissId) => {
          if (!inviteRemisser.has(remissId)) {
            uninvitedResponses++;
          }
        });
        
        // Response rate: only if invited to at least one
        const responseRate = inviteCount > 0
          ? Math.round((responseCount / inviteCount) * 100)
          : null;

        organizations.push({
          entity_id: entityId,
          entity_name: entityNameMap.get(entityId) || "Unknown",
          response_count: responseCount,
          invite_count: inviteCount,
          response_rate: responseRate,
          uninvited_responses: uninvitedResponses,
        });
      });

      // Sort by response count descending
      organizations.sort((a, b) => b.response_count - a.response_count);

      // Calculate totals
      const total_responses = responsesByEntity?.length || 0;
      const total_invites = invitesByEntity?.length || 0;
      const overall_response_rate = total_invites > 0
        ? Math.round((total_responses / total_invites) * 100)
        : 0;

      return {
        total_responses,
        total_invites,
        total_entities: allEntityIds.size,
        overall_response_rate,
        organizations: organizations.slice(0, limit),
      };
    },
    staleTime: 60000, // 1 minute
  });
}
