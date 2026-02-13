import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "read";

    if (mode === "compute") {
      const calculationDate = new Date().toISOString().split("T")[0];

      // Paginated fetch helper
      const fetchAll = async (table: string, selectCols: string, notNullCols: string[]) => {
        const all: Record<string, unknown>[] = [];
        let offset = 0;
        const pageSize = 1000;
        while (true) {
          let q = supabase.from(table).select(selectCols).range(offset, offset + pageSize - 1);
          for (const col of notNullCols) {
            q = q.not(col, "is", null);
          }
          const { data, error } = await q;
          if (error) throw new Error(table + " at " + offset + ": " + error.message);
          const rows = data || [];
          all.push(...rows);
          if (rows.length < pageSize) break;
          offset += pageSize;
        }
        return all;
      };

      // 1. Submissions
      const subRows = await fetchAll("remiss_responses", "entity_id", ["entity_id"]);
      const subMap = new Map<string, number>();
      for (const r of subRows) {
        const eid = r.entity_id as string;
        subMap.set(eid, (subMap.get(eid) || 0) + 1);
      }

      // 2. Invitations
      const invRows = await fetchAll("remiss_invitees", "entity_id", ["entity_id"]);
      const invMap = new Map<string, number>();
      for (const r of invRows) {
        const eid = r.entity_id as string;
        invMap.set(eid, (invMap.get(eid) || 0) + 1);
      }

      // 3. Stances
      const stanceRows = await fetchAll("remiss_responses", "entity_id, stance_summary", ["entity_id", "stance_summary"]);
      const stanceMap = new Map<string, Map<string, number>>();
      for (const r of stanceRows) {
        const eid = r.entity_id as string;
        const stance = r.stance_summary as string;
        if (!stanceMap.has(eid)) stanceMap.set(eid, new Map());
        const m = stanceMap.get(eid)!;
        m.set(stance, (m.get(stance) || 0) + 1);
      }

      // 4. Cases
      const caseRows = await fetchAll("remiss_responses", "entity_id, remiss_id", ["entity_id"]);
      const caseMap = new Map<string, Set<string>>();
      for (const r of caseRows) {
        const eid = r.entity_id as string;
        if (!caseMap.has(eid)) caseMap.set(eid, new Set());
        caseMap.get(eid)!.add(r.remiss_id as string);
      }

      const allIds = new Set<string>([...subMap.keys(), ...invMap.keys()]);
      const maxSub = Math.max(1, ...subMap.values());
      const maxInv = Math.max(1, ...invMap.values());
      const maxCase = Math.max(1, ...[...caseMap.values()].map(s => s.size));

      const records: Record<string, unknown>[] = [];

      for (const eid of allIds) {
        const subs = subMap.get(eid) || 0;
        const invs = invMap.get(eid) || 0;
        const cases = caseMap.get(eid)?.size || 0;
        let stanceCon = 0;
        const st = stanceMap.get(eid);
        if (st && st.size > 0) {
          const tot = [...st.values()].reduce((a, b) => a + b, 0);
          const mx = Math.max(...st.values());
          stanceCon = tot > 0 ? (mx / tot) * 100 : 0;
        }

        records.push({
          entity_id: eid, influence_type: "remissvar_frequency",
          influence_score: Math.round((subs / maxSub) * 10000) / 100,
          total_submissions: subs, case_count: null, calculation_date: calculationDate,
          evidence: { raw_count: subs, max_in_corpus: maxSub },
        });
        records.push({
          entity_id: eid, influence_type: "invitation_rate",
          influence_score: Math.round((invs / maxInv) * 10000) / 100,
          total_submissions: null, case_count: null, calculation_date: calculationDate,
          evidence: { raw_count: invs, max_in_corpus: maxInv },
        });
        records.push({
          entity_id: eid, influence_type: "stance_consistency",
          influence_score: Math.round(stanceCon * 100) / 100,
          total_submissions: subs, case_count: null, calculation_date: calculationDate,
          evidence: { stance_distribution: st ? Object.fromEntries(st) : {} },
        });
        records.push({
          entity_id: eid, influence_type: "cross_case_breadth",
          influence_score: Math.round((cases / maxCase) * 10000) / 100,
          total_submissions: null, case_count: cases, calculation_date: calculationDate,
          evidence: { distinct_remiss_processes: cases, max_in_corpus: maxCase },
        });
      }

      let upserted = 0;
      let errors = 0;
      for (let i = 0; i < records.length; i += 200) {
        const batch = records.slice(i, i + 200);
        const { error } = await supabase
          .from("stakeholder_influence")
          .upsert(batch, { onConflict: "entity_id,influence_type,calculation_date" });
        if (error) { console.error("Batch error:", error.message); errors += batch.length; }
        else { upserted += batch.length; }
      }

      return new Response(JSON.stringify({
        success: true, mode: "compute", calculation_date: calculationDate,
        entities_processed: allIds.size, records_upserted: upserted, errors,
        metrics: {
          total_submissions_fetched: subRows.length, total_invitations_fetched: invRows.length,
          total_stance_rows_fetched: stanceRows.length, total_case_rows_fetched: caseRows.length,
          max_submissions: maxSub, max_invitations: maxInv, max_cases: maxCase,
        },
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // READ MODE
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 200);
    const { data, error } = await supabase
      .from("stakeholder_influence")
      .select("*")
      .order("influence_score", { ascending: false })
      .limit(limit);

    if (error) throw new Error("Read: " + error.message);

    return new Response(
      JSON.stringify({ success: true, mode: "read", count: (data || []).length, data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Error:", msg);
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
