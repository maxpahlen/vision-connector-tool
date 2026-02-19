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
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify caller is admin
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: claimsError } =
      await anonClient.auth.getUser();
    if (claimsError || !claimsData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", claimsData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ error: "Admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse options
    const body = req.method === "POST" ? await req.json() : {};
    const dryRun = body.dry_run === true;

    console.log(`Computing entity co-occurrence (dry_run=${dryRun})...`);

    // Step 1: Build invite pairs — one count per remiss per pair
    const { data: invitePairs, error: invErr } = await supabase.rpc(
      "get_invite_cooccurrence_pairs"
    ).select("*");

    // If RPC doesn't exist yet, fall back to raw query via edge
    // We'll use direct SQL via supabase-js admin
    // Actually, let's do it with multiple queries and JS aggregation
    // since we can't create RPCs from edge functions.

    // Fetch all invitees with entity_id
    const { data: invitees, error: inviteesErr } = await supabase
      .from("remiss_invitees")
      .select("remiss_id, entity_id")
      .not("entity_id", "is", null);

    if (inviteesErr) throw new Error(`Invitees fetch: ${inviteesErr.message}`);

    // Fetch all responses with entity_id
    const { data: responses, error: responsesErr } = await supabase
      .from("remiss_responses")
      .select("remiss_id, entity_id")
      .not("entity_id", "is", null);

    if (responsesErr) throw new Error(`Responses fetch: ${responsesErr.message}`);

    // Fetch remiss dates for first/last cooccurrence
    const { data: remissDocs, error: remissErr } = await supabase
      .from("remiss_documents")
      .select("id, created_at, remiss_deadline");

    if (remissErr) throw new Error(`Remiss docs fetch: ${remissErr.message}`);

    const remissDateMap = new Map<string, Date>();
    for (const rd of remissDocs || []) {
      const d = rd.remiss_deadline
        ? new Date(rd.remiss_deadline)
        : rd.created_at
        ? new Date(rd.created_at)
        : null;
      if (d) remissDateMap.set(rd.id, d);
    }

    // Group by remiss_id
    const invitesByRemiss = new Map<string, Set<string>>();
    for (const inv of invitees || []) {
      if (!inv.entity_id) continue;
      if (!invitesByRemiss.has(inv.remiss_id)) {
        invitesByRemiss.set(inv.remiss_id, new Set());
      }
      invitesByRemiss.get(inv.remiss_id)!.add(inv.entity_id);
    }

    const responsesByRemiss = new Map<string, Set<string>>();
    for (const resp of responses || []) {
      if (!resp.entity_id) continue;
      if (!responsesByRemiss.has(resp.remiss_id)) {
        responsesByRemiss.set(resp.remiss_id, new Set());
      }
      responsesByRemiss.get(resp.remiss_id)!.add(resp.entity_id);
    }

    // Build pair data
    // Key: "entityA|entityB" (canonical: a < b)
    interface PairData {
      inviteRemissIds: Set<string>;
      responseRemissIds: Set<string>;
      allRemissIds: Set<string>;
    }
    const pairMap = new Map<string, PairData>();

    const makePairKey = (a: string, b: string): string => {
      return a < b ? `${a}|${b}` : `${b}|${a}`;
    };

    const ensurePair = (key: string): PairData => {
      if (!pairMap.has(key)) {
        pairMap.set(key, {
          inviteRemissIds: new Set(),
          responseRemissIds: new Set(),
          allRemissIds: new Set(),
        });
      }
      return pairMap.get(key)!;
    };

    // Process invite pairs
    for (const [remissId, entities] of invitesByRemiss) {
      const arr = Array.from(entities);
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const key = makePairKey(arr[i], arr[j]);
          const pair = ensurePair(key);
          pair.inviteRemissIds.add(remissId);
          pair.allRemissIds.add(remissId);
        }
      }
    }

    // Process response pairs
    for (const [remissId, entities] of responsesByRemiss) {
      const arr = Array.from(entities);
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const key = makePairKey(arr[i], arr[j]);
          const pair = ensurePair(key);
          pair.responseRemissIds.add(remissId);
          pair.allRemissIds.add(remissId);
        }
      }
    }

    console.log(`Found ${pairMap.size} unique entity pairs`);

    // Compute per-entity participation counts for Jaccard
    const entityParticipation = new Map<string, Set<string>>();
    const addParticipation = (entityId: string, remissId: string) => {
      if (!entityParticipation.has(entityId)) {
        entityParticipation.set(entityId, new Set());
      }
      entityParticipation.get(entityId)!.add(remissId);
    };

    for (const [remissId, entities] of invitesByRemiss) {
      for (const e of entities) addParticipation(e, remissId);
    }
    for (const [remissId, entities] of responsesByRemiss) {
      for (const e of entities) addParticipation(e, remissId);
    }

    // Build upsert rows
    const MAX_SHARED_CASES = 100;
    const rows: Array<Record<string, unknown>> = [];

    for (const [key, pair] of pairMap) {
      const [entityA, entityB] = key.split("|");
      const inviteCount = pair.inviteRemissIds.size;
      const responseCount = pair.responseRemissIds.size;
      const totalCount = pair.allRemissIds.size; // distinct remiss count

      // Jaccard: |A ∩ B| / |A ∪ B|
      const totalA = entityParticipation.get(entityA)?.size ?? 0;
      const totalB = entityParticipation.get(entityB)?.size ?? 0;
      const intersection = totalCount;
      const union = totalA + totalB - intersection;
      const jaccard = union > 0 ? intersection / union : 0;

      // v1: relationship_strength = jaccard_score
      const strength = Math.round(jaccard * 100) / 100;

      // Dates
      const allDates = Array.from(pair.allRemissIds)
        .map((id) => remissDateMap.get(id))
        .filter(Boolean) as Date[];
      allDates.sort((a, b) => a.getTime() - b.getTime());

      // Cap shared_cases to 100 most recent
      const sortedRemissIds = Array.from(pair.allRemissIds);
      sortedRemissIds.sort((a, b) => {
        const da = remissDateMap.get(a)?.getTime() ?? 0;
        const db = remissDateMap.get(b)?.getTime() ?? 0;
        return db - da; // most recent first
      });

      rows.push({
        entity_a_id: entityA,
        entity_b_id: entityB,
        invite_cooccurrence_count: inviteCount,
        response_cooccurrence_count: responseCount,
        cooccurrence_count: totalCount,
        jaccard_score: Math.round(jaccard * 10000) / 10000,
        relationship_strength: strength,
        shared_cases: sortedRemissIds.slice(0, MAX_SHARED_CASES),
        total_shared_case_count: totalCount,
        first_cooccurrence_date: allDates.length > 0
          ? allDates[0].toISOString().split("T")[0]
          : null,
        last_cooccurrence_date: allDates.length > 0
          ? allDates[allDates.length - 1].toISOString().split("T")[0]
          : null,
        updated_at: new Date().toISOString(),
      });
    }

    // Sort by strength descending for stats
    rows.sort(
      (a, b) =>
        (b.relationship_strength as number) -
        (a.relationship_strength as number)
    );

    const stats = {
      total_pairs: rows.length,
      avg_jaccard:
        rows.length > 0
          ? Math.round(
              (rows.reduce((s, r) => s + (r.jaccard_score as number), 0) /
                rows.length) *
                10000
            ) / 10000
          : 0,
      max_count: rows.length > 0 ? (rows[0].cooccurrence_count as number) : 0,
      strongest: rows.slice(0, 5).map((r) => ({
        entity_a_id: r.entity_a_id,
        entity_b_id: r.entity_b_id,
        cooccurrence_count: r.cooccurrence_count,
        jaccard_score: r.jaccard_score,
        strength: r.relationship_strength,
      })),
    };

    if (dryRun) {
      return new Response(
        JSON.stringify({ dry_run: true, stats }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Full recompute: clear existing data then insert
    const { error: deleteErr } = await supabase
      .from("entity_cooccurrence")
      .delete()
      .gte("cooccurrence_count", 0); // delete all

    if (deleteErr) throw new Error(`Delete failed: ${deleteErr.message}`);

    // Batch upsert in chunks of 500
    const BATCH_SIZE = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error: insertErr } = await supabase
        .from("entity_cooccurrence")
        .insert(batch);
      if (insertErr) {
        console.error(`Insert batch ${i} failed:`, insertErr.message);
        throw new Error(`Insert failed at batch ${i}: ${insertErr.message}`);
      }
      inserted += batch.length;
    }

    console.log(`Inserted ${inserted} co-occurrence pairs`);

    return new Response(
      JSON.stringify({ success: true, inserted, stats }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Compute co-occurrence error:", err);
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
