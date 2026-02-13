import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface InfluenceResult {
  entity_id: string;
  entity_name: string;
  entity_type: string;
  remissvar_frequency: number;
  invitation_rate: number;
  stance_consistency: number;
  cross_case_breadth: number;
  composite_score: number;
  total_submissions: number;
  total_invitations: number;
  case_count: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "read"; // 'read' | 'compute'
    const entityType = url.searchParams.get("entity_type"); // optional filter
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);

    if (mode === "compute") {
      // ── COMPUTE MODE: Calculate and store influence scores ──
      const calculationDate = new Date().toISOString().split("T")[0];

      // 1. Remissvar frequency: how many remissvar each org submitted
      const { data: submissionCounts, error: subErr } = await supabase
        .from("remiss_responses")
        .select("entity_id")
        .not("entity_id", "is", null);

      if (subErr) throw new Error(`Submissions query: ${subErr.message}`);

      const submissionMap = new Map<string, number>();
      for (const row of submissionCounts || []) {
        submissionMap.set(row.entity_id, (submissionMap.get(row.entity_id) || 0) + 1);
      }

      // 2. Invitation frequency: how many times each org was invited
      const { data: invitations, error: invErr } = await supabase
        .from("remiss_invitees")
        .select("entity_id")
        .not("entity_id", "is", null);

      if (invErr) throw new Error(`Invitations query: ${invErr.message}`);

      const invitationMap = new Map<string, number>();
      for (const row of invitations || []) {
        invitationMap.set(row.entity_id, (invitationMap.get(row.entity_id) || 0) + 1);
      }

      // 3. Stance consistency: how consistent are stances across submissions
      const { data: stanceData, error: stanceErr } = await supabase
        .from("remiss_responses")
        .select("entity_id, stance_summary")
        .not("entity_id", "is", null)
        .not("stance_summary", "is", null);

      if (stanceErr) throw new Error(`Stance query: ${stanceErr.message}`);

      const stanceMap = new Map<string, Map<string, number>>();
      for (const row of stanceData || []) {
        if (!stanceMap.has(row.entity_id)) {
          stanceMap.set(row.entity_id, new Map());
        }
        const stances = stanceMap.get(row.entity_id)!;
        stances.set(row.stance_summary, (stances.get(row.stance_summary) || 0) + 1);
      }

      // 4. Cross-case breadth: how many distinct remiss processes
      const { data: caseData, error: caseErr } = await supabase
        .from("remiss_responses")
        .select("entity_id, remiss_id")
        .not("entity_id", "is", null);

      if (caseErr) throw new Error(`Case query: ${caseErr.message}`);

      const caseMap = new Map<string, Set<string>>();
      for (const row of caseData || []) {
        if (!caseMap.has(row.entity_id)) {
          caseMap.set(row.entity_id, new Set());
        }
        caseMap.get(row.entity_id)!.add(row.remiss_id);
      }

      // Collect all unique entity IDs
      const allEntityIds = new Set<string>([
        ...submissionMap.keys(),
        ...invitationMap.keys(),
      ]);

      // Calculate max values for normalization
      const maxSubmissions = Math.max(1, ...submissionMap.values());
      const maxInvitations = Math.max(1, ...invitationMap.values());
      const maxCases = Math.max(1, ...[...caseMap.values()].map((s) => s.size));

      // Build influence records
      const records: Array<{
        entity_id: string;
        influence_type: string;
        influence_score: number;
        total_submissions: number | null;
        case_count: number | null;
        calculation_date: string;
        evidence: Record<string, unknown>;
      }> = [];

      for (const entityId of allEntityIds) {
        const submissions = submissionMap.get(entityId) || 0;
        const invitations_count = invitationMap.get(entityId) || 0;
        const cases = caseMap.get(entityId)?.size || 0;

        // Stance consistency: % of submissions with the dominant stance
        let stanceConsistency = 0;
        const stances = stanceMap.get(entityId);
        if (stances && stances.size > 0) {
          const totalStanced = [...stances.values()].reduce((a, b) => a + b, 0);
          const maxStance = Math.max(...stances.values());
          stanceConsistency = totalStanced > 0 ? (maxStance / totalStanced) * 100 : 0;
        }

        // Normalized scores (0-100)
        const freqScore = (submissions / maxSubmissions) * 100;
        const invScore = (invitations_count / maxInvitations) * 100;
        const caseScore = (cases / maxCases) * 100;

        records.push({
          entity_id: entityId,
          influence_type: "remissvar_frequency",
          influence_score: Math.round(freqScore * 100) / 100,
          total_submissions: submissions,
          case_count: null,
          calculation_date: calculationDate,
          evidence: { raw_count: submissions, max_in_corpus: maxSubmissions },
        });

        records.push({
          entity_id: entityId,
          influence_type: "invitation_rate",
          influence_score: Math.round(invScore * 100) / 100,
          total_submissions: null,
          case_count: null,
          calculation_date: calculationDate,
          evidence: { raw_count: invitations_count, max_in_corpus: maxInvitations },
        });

        records.push({
          entity_id: entityId,
          influence_type: "stance_consistency",
          influence_score: Math.round(stanceConsistency * 100) / 100,
          total_submissions: submissions,
          case_count: null,
          calculation_date: calculationDate,
          evidence: { stance_distribution: stances ? Object.fromEntries(stances) : {} },
        });

        records.push({
          entity_id: entityId,
          influence_type: "cross_case_breadth",
          influence_score: Math.round(caseScore * 100) / 100,
          total_submissions: null,
          case_count: cases,
          calculation_date: calculationDate,
          evidence: { distinct_remiss_processes: cases, max_in_corpus: maxCases },
        });
      }

      // Upsert in batches of 200
      const BATCH_SIZE = 200;
      let upserted = 0;
      let errors = 0;
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from("stakeholder_influence")
          .upsert(batch, { onConflict: "entity_id,influence_type,calculation_date" });
        if (error) {
          console.error(`Batch ${i / BATCH_SIZE} error:`, error.message);
          errors += batch.length;
        } else {
          upserted += batch.length;
        }
      }

      // Refresh materialized view
      // Note: Direct SQL not available via client, so we skip MV refresh here.
      // It can be refreshed via a scheduled SQL job or manually.

      return new Response(
        JSON.stringify({
          success: true,
          mode: "compute",
          calculation_date: calculationDate,
          entities_processed: allEntityIds.size,
          records_upserted: upserted,
          errors,
          metrics: {
            max_submissions: maxSubmissions,
            max_invitations: maxInvitations,
            max_cases: maxCases,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── READ MODE: Return stored influence scores ──
    let query = supabase
      .from("stakeholder_influence")
      .select(`
        id,
        entity_id,
        influence_type,
        influence_score,
        total_submissions,
        case_count,
        calculation_date,
        evidence,
        entities!inner(name, entity_type)
      `)
      .order("influence_score", { ascending: false })
      .limit(limit);

    if (entityType) {
      query = query.eq("entities.entity_type", entityType);
    }

    const { data, error } = await query;

    if (error) {
      // Fallback without join if FK hint fails
      const { data: fallbackData, error: fallbackErr } = await supabase
        .from("stakeholder_influence")
        .select("*")
        .order("influence_score", { ascending: false })
        .limit(limit);

      if (fallbackErr) throw new Error(`Read query: ${fallbackErr.message}`);

      return new Response(
        JSON.stringify({ success: true, mode: "read", data: fallbackData }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, mode: "read", count: data?.length || 0, data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
