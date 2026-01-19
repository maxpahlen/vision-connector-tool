import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OrganizationMetrics {
  entity_id: string;
  entity_name: string;
  response_count: number;
  invite_count: number;
  response_rate: number | null;
  uninvited_responses: number;
}

interface ParticipationSummary {
  total_responses: number;
  total_invites: number;
  total_entities: number;
  overall_response_rate: number;
  organizations: OrganizationMetrics[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse query params
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "100", 10);

    // Get total response count (bypasses 1000-row limit via aggregate)
    const { count: totalResponses, error: respCountErr } = await supabase
      .from("remiss_responses")
      .select("*", { count: "exact", head: true })
      .not("entity_id", "is", null);

    if (respCountErr) throw respCountErr;

    // Get total invite count
    const { count: totalInvites, error: invCountErr } = await supabase
      .from("remiss_invitees")
      .select("*", { count: "exact", head: true })
      .not("entity_id", "is", null);

    if (invCountErr) throw invCountErr;

    // Get responses grouped by entity with remiss_id for uninvited calculation
    const { data: responseData, error: respErr } = await supabase
      .from("remiss_responses")
      .select("entity_id, remiss_id")
      .not("entity_id", "is", null);

    if (respErr) throw respErr;

    // Get invites grouped by entity with remiss_id
    const { data: inviteData, error: invErr } = await supabase
      .from("remiss_invitees")
      .select("entity_id, remiss_id")
      .not("entity_id", "is", null);

    if (invErr) throw invErr;

    // Get all entity names for organizations
    const { data: entities, error: entErr } = await supabase
      .from("entities")
      .select("id, name")
      .eq("entity_type", "organization");

    if (entErr) throw entErr;

    const entityNameMap = new Map(entities?.map((e) => [e.id, e.name]) || []);

    // Aggregate responses by entity with remiss tracking
    const responseMap = new Map<string, Set<string>>();
    responseData?.forEach((r) => {
      if (!r.entity_id) return;
      if (!responseMap.has(r.entity_id)) {
        responseMap.set(r.entity_id, new Set());
      }
      responseMap.get(r.entity_id)!.add(r.remiss_id);
    });

    // Aggregate invites by entity with remiss tracking
    const inviteMap = new Map<string, Set<string>>();
    inviteData?.forEach((i) => {
      if (!i.entity_id) return;
      if (!inviteMap.has(i.entity_id)) {
        inviteMap.set(i.entity_id, new Set());
      }
      inviteMap.get(i.entity_id)!.add(i.remiss_id);
    });

    // Combine all entity IDs
    const allEntityIds = new Set([...responseMap.keys(), ...inviteMap.keys()]);

    // Calculate metrics per organization
    const organizations: OrganizationMetrics[] = [];

    allEntityIds.forEach((entityId) => {
      const responseRemisser = responseMap.get(entityId) || new Set();
      const inviteRemisser = inviteMap.get(entityId) || new Set();

      const responseCount = responseRemisser.size;
      const inviteCount = inviteRemisser.size;

      // Uninvited responses: responded but not invited
      let uninvitedResponses = 0;
      responseRemisser.forEach((remissId) => {
        if (!inviteRemisser.has(remissId)) {
          uninvitedResponses++;
        }
      });

      // Response rate: only if invited
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

    // Calculate overall response rate
    const overallResponseRate =
      (totalInvites || 0) > 0
        ? Math.round(((totalResponses || 0) / (totalInvites || 0)) * 100)
        : 0;

    const result: ParticipationSummary = {
      total_responses: totalResponses || 0,
      total_invites: totalInvites || 0,
      total_entities: allEntityIds.size,
      overall_response_rate: overallResponseRate,
      organizations: organizations.slice(0, limit),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error fetching participation metrics:", message);
    return new Response(
      JSON.stringify({ error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
