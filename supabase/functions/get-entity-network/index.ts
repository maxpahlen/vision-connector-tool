import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check — this is a protected read endpoint
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify user is authenticated
    const { data: userData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const entityId = url.searchParams.get("entity_id");
    const minStrength = parseFloat(
      url.searchParams.get("min_strength") ?? "0.1"
    );
    const limit = Math.min(
      parseInt(url.searchParams.get("limit") ?? "200", 10),
      500
    );
    const entityTypes = url.searchParams.get("entity_types")
      ? url.searchParams.get("entity_types")!.split(",")
      : null;

    // Fetch co-occurrence edges
    let query = supabase
      .from("entity_cooccurrence")
      .select(
        "entity_a_id, entity_b_id, cooccurrence_count, invite_cooccurrence_count, response_cooccurrence_count, relationship_strength, total_shared_case_count, jaccard_score"
      )
      .gte("relationship_strength", minStrength)
      .order("relationship_strength", { ascending: false });

    if (entityId) {
      query = query.or(
        `entity_a_id.eq.${entityId},entity_b_id.eq.${entityId}`
      );
    }

    const { data: edges, error: edgeErr } = await query.limit(limit * 3);

    if (edgeErr) throw new Error(`Edge query: ${edgeErr.message}`);

    if (!edges || edges.length === 0) {
      // Still compute type_counts from the full dataset (ignoring filters)
      const typeCounts = await computeTypeCounts(supabase);
      return new Response(
        JSON.stringify({ nodes: [], edges: [], type_counts: typeCounts }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Collect unique entity IDs from edges
    const entityIds = new Set<string>();
    for (const e of edges) {
      entityIds.add(e.entity_a_id);
      entityIds.add(e.entity_b_id);
    }

    // Fetch entity details in batches of 100
    const idArray = Array.from(entityIds);
    const entities = new Map<
      string,
      { id: string; name: string; entity_type: string }
    >();
    for (let i = 0; i < idArray.length; i += 100) {
      const batch = idArray.slice(i, i + 100);
      const { data: entityData, error: entityErr } = await supabase
        .from("entities")
        .select("id, name, entity_type")
        .in("id", batch);
      if (entityErr)
        throw new Error(`Entity fetch: ${entityErr.message}`);
      for (const e of entityData || []) {
        entities.set(e.id, e);
      }
    }

    // Compute type_counts from ALL entities involved in co-occurrence (before type filter)
    const typeCounts: Record<string, number> = {};
    for (const [, entity] of entities) {
      typeCounts[entity.entity_type] = (typeCounts[entity.entity_type] ?? 0) + 1;
    }

    // Filter by entity types if specified
    if (entityTypes) {
      const typeSet = new Set(entityTypes);
      for (const [id, entity] of entities) {
        if (!typeSet.has(entity.entity_type)) {
          entities.delete(id);
        }
      }
    }

    // Filter edges to only include entities we have + apply node limit
    const filteredEdges = edges.filter(
      (e) => entities.has(e.entity_a_id) && entities.has(e.entity_b_id)
    );

    // Compute degree for each node from filtered edges
    const degreeMap = new Map<string, number>();
    for (const e of filteredEdges) {
      degreeMap.set(e.entity_a_id, (degreeMap.get(e.entity_a_id) ?? 0) + 1);
      degreeMap.set(e.entity_b_id, (degreeMap.get(e.entity_b_id) ?? 0) + 1);
    }

    // Sort nodes by degree, take top `limit`
    const sortedNodeIds = Array.from(degreeMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([id]) => id);
    const nodeSet = new Set(sortedNodeIds);

    // If centered on an entity, ensure it's included
    if (entityId && entities.has(entityId)) {
      nodeSet.add(entityId);
    }

    // Final filter
    const finalEdges = filteredEdges
      .filter((e) => nodeSet.has(e.entity_a_id) && nodeSet.has(e.entity_b_id))
      .map((e) => ({
        source: e.entity_a_id,
        target: e.entity_b_id,
        weight: e.relationship_strength,
        invite_count: e.invite_cooccurrence_count,
        response_count: e.response_cooccurrence_count,
        shared_cases_count: e.total_shared_case_count,
        jaccard_score: e.jaccard_score,
      }));

    // Recompute degree from final edges
    const finalDegree = new Map<string, number>();
    for (const e of finalEdges) {
      finalDegree.set(e.source, (finalDegree.get(e.source) ?? 0) + 1);
      finalDegree.set(e.target, (finalDegree.get(e.target) ?? 0) + 1);
    }

    const nodes = Array.from(nodeSet)
      .filter((id) => entities.has(id))
      .map((id) => {
        const entity = entities.get(id)!;
        return {
          id: entity.id,
          name: entity.name,
          entity_type: entity.entity_type,
          degree: finalDegree.get(id) ?? 0,
        };
      });

    return new Response(
      JSON.stringify({ nodes, edges: finalEdges, type_counts: typeCounts }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Get entity network error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

/**
 * Compute entity type counts from all entities that appear in
 * the co-occurrence table, regardless of current filters.
 * Label: "Totalt i dataset".
 */
async function computeTypeCounts(
  supabase: ReturnType<typeof createClient>
): Promise<Record<string, number>> {
  // Get a sample of entity IDs from co-occurrence
  const { data: sample } = await supabase
    .from("entity_cooccurrence")
    .select("entity_a_id, entity_b_id")
    .limit(500);

  if (!sample || sample.length === 0) return {};

  const ids = new Set<string>();
  for (const row of sample) {
    ids.add(row.entity_a_id);
    ids.add(row.entity_b_id);
  }

  const idArray = Array.from(ids);
  const counts: Record<string, number> = {};
  for (let i = 0; i < idArray.length; i += 100) {
    const batch = idArray.slice(i, i + 100);
    const { data: entities } = await supabase
      .from("entities")
      .select("entity_type")
      .in("id", batch);
    for (const e of entities || []) {
      counts[e.entity_type] = (counts[e.entity_type] ?? 0) + 1;
    }
  }
  return counts;
}
