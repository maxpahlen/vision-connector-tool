import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type RelType =
  | "proposition_to_committee_report"
  | "committee_report_to_proposition"
  | "sou_to_proposition"
  | "directive_to_sou"
  | "proposition_to_law"
  | "remiss_to_sou"
  | "references";

interface Classification {
  relationship_type: RelType;
  confidence_score: number;
  confidence_class: "high" | "medium" | "low";
}

const DIRECTED_RULES: Record<string, Classification> = {
  "proposition|committee_report": { relationship_type: "proposition_to_committee_report", confidence_score: 0.95, confidence_class: "high" },
  "committee_report|proposition": { relationship_type: "committee_report_to_proposition", confidence_score: 0.95, confidence_class: "high" },
  "sou|proposition": { relationship_type: "sou_to_proposition", confidence_score: 0.9, confidence_class: "high" },
  "proposition|sou": { relationship_type: "sou_to_proposition", confidence_score: 0.9, confidence_class: "high" },
  "directive|sou": { relationship_type: "directive_to_sou", confidence_score: 0.9, confidence_class: "high" },
  "sou|directive": { relationship_type: "directive_to_sou", confidence_score: 0.9, confidence_class: "high" },
  "proposition|law": { relationship_type: "proposition_to_law", confidence_score: 0.9, confidence_class: "high" },
};

function classify(sourceDt: string, targetDt: string): Classification {
  const key = `${sourceDt}|${targetDt}`;
  return DIRECTED_RULES[key] || { relationship_type: "references", confidence_score: 0.8, confidence_class: "medium" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dryRun = true } = await req.json().catch(() => ({}));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Step 1: Build doc_type lookup (all documents, paginated)
    const docTypeMap = new Map<string, string>();
    let docPage = 0;
    const pageSize = 1000;
    while (true) {
      const { data: docs, error } = await supabase
        .from("documents")
        .select("id, doc_type")
        .range(docPage * pageSize, (docPage + 1) * pageSize - 1);
      if (error) throw new Error(`Fetch docs: ${error.message}`);
      if (!docs || docs.length === 0) break;
      for (const d of docs) docTypeMap.set(d.id, d.doc_type);
      if (docs.length < pageSize) break;
      docPage++;
    }

    // Step 2: Build remiss parent set
    const remissSourceIds = new Set<string>();
    let remissPage = 0;
    while (true) {
      const { data: rds, error } = await supabase
        .from("remiss_documents")
        .select("parent_document_id")
        .range(remissPage * pageSize, (remissPage + 1) * pageSize - 1);
      if (error) break;
      if (!rds || rds.length === 0) break;
      for (const rd of rds) remissSourceIds.add(rd.parent_document_id);
      if (rds.length < pageSize) break;
      remissPage++;
    }

    // Step 3: Fetch resolved references (paginated)
    interface InsertRow {
      source_document_id: string;
      target_document_id: string;
      relationship_type: RelType;
      confidence_score: number;
      confidence_class: string;
      evidence_details: Record<string, unknown>;
      source_reference_id: string;
      derived_by: string;
    }

    const seen = new Set<string>();
    const toInsert: InsertRow[] = [];
    const skippedSelfRef: string[] = [];
    const countsByType: Record<string, number> = {};
    let totalRefs = 0;
    let duplicatesRemoved = 0;

    let refPage = 0;
    while (true) {
      const { data: refs, error } = await supabase
        .from("document_references")
        .select("id, source_document_id, target_document_id")
        .not("target_document_id", "is", null)
        .range(refPage * pageSize, (refPage + 1) * pageSize - 1);

      if (error) throw new Error(`Fetch refs: ${error.message}`);
      if (!refs || refs.length === 0) break;
      totalRefs += refs.length;

      for (const ref of refs) {
        const srcId = ref.source_document_id;
        const tgtId = ref.target_document_id!;

        if (srcId === tgtId) { skippedSelfRef.push(ref.id); continue; }

        const srcDt = docTypeMap.get(srcId);
        const tgtDt = docTypeMap.get(tgtId);
        if (!srcDt || !tgtDt) continue;

        let cls: Classification;
        if (remissSourceIds.has(srcId) && tgtDt === "sou") {
          cls = { relationship_type: "remiss_to_sou", confidence_score: 0.85, confidence_class: "high" };
        } else {
          cls = classify(srcDt, tgtDt);
        }

        // Canonical order for symmetric type
        let finalSrc = srcId;
        let finalTgt = tgtId;
        if (cls.relationship_type === "references" && finalSrc > finalTgt) {
          [finalSrc, finalTgt] = [finalTgt, finalSrc];
        }

        const dedupKey = `${finalSrc}|${finalTgt}|${cls.relationship_type}`;
        if (seen.has(dedupKey)) { duplicatesRemoved++; continue; }
        seen.add(dedupKey);

        toInsert.push({
          source_document_id: finalSrc,
          target_document_id: finalTgt,
          relationship_type: cls.relationship_type,
          confidence_score: cls.confidence_score,
          confidence_class: cls.confidence_class,
          evidence_details: {
            evidence_type: "explicit_reference",
            matched_fields: ["doc_number"],
            rule_version: "backfill-v1",
          },
          source_reference_id: ref.id,
          derived_by: "resolver",
        });

        countsByType[cls.relationship_type] = (countsByType[cls.relationship_type] || 0) + 1;
      }

      if (refs.length < pageSize) break;
      refPage++;
    }

    if (dryRun) {
      const samples: Record<string, unknown[]> = {};
      for (const row of toInsert) {
        const t = row.relationship_type;
        if (!samples[t]) samples[t] = [];
        if (samples[t].length < 3) samples[t].push(row);
      }

      return new Response(
        JSON.stringify({
          dryRun: true,
          totalResolvedRefs: totalRefs,
          skippedSelfRefs: skippedSelfRef.length,
          duplicatesRemovedInMemory: duplicatesRemoved,
          toInsertCount: toInsert.length,
          countsByType,
          samples,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Write mode
    let inserted = 0;
    let conflictSkipped = 0;
    const batchSize = 100;

    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize);
      const { data: result, error: insErr } = await supabase
        .from("document_relationships")
        .upsert(batch, {
          onConflict: "source_document_id,target_document_id,relationship_type",
          ignoreDuplicates: true,
        })
        .select("id");

      if (insErr) {
        // Symmetric conflicts — insert one by one
        for (const row of batch) {
          const { data: single, error: sErr } = await supabase
            .from("document_relationships")
            .upsert([row], {
              onConflict: "source_document_id,target_document_id,relationship_type",
              ignoreDuplicates: true,
            })
            .select("id");
          if (sErr) conflictSkipped++;
          else inserted += (single?.length || 0);
        }
      } else {
        inserted += (result?.length || 0);
      }
    }

    const { count: totalRows } = await supabase
      .from("document_relationships")
      .select("*", { count: "exact", head: true });

    return new Response(
      JSON.stringify({
        dryRun: false,
        totalResolvedRefs: totalRefs,
        skippedSelfRefs: skippedSelfRef.length,
        duplicatesRemovedInMemory: duplicatesRemoved,
        attempted: toInsert.length,
        inserted,
        conflictSkipped,
        totalRowsInTable: totalRows,
        countsByType,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
