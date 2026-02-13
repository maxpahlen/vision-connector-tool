import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUMMARY_MODEL = "gpt-4o-2024-08-06";
const MODEL_VERSION = "gpt-4o-v1";
const BATCH_SIZE = 10;
const MAX_INPUT_CHARS = 12000; // ~3000 tokens, well within context

interface SummaryResult {
  summary_text: string;
  policy_aim: string;
  core_recommendations: string[];
  key_actors: { name: string; role: string }[];
  policy_domains: string[];
  keywords: string[];
  outcome_status: string;
}

const SYSTEM_PROMPT = `You are a Swedish legislative policy analyst. Given the full text of a Swedish government document (SOU, proposition, directive, committee report, or law), produce a structured summary in Swedish.

Your output MUST be a JSON object with these fields:
- summary_text: A 200-400 word summary in Swedish covering the document's purpose, key proposals, and conclusions.
- policy_aim: One sentence describing the policy goal.
- core_recommendations: Array of 3-8 key recommendations or proposals (strings, in Swedish).
- key_actors: Array of objects {name, role} for key people/organizations mentioned.
- policy_domains: Array of 2-5 policy domain tags in Swedish (e.g. "utbildning", "miljö", "hälsa", "arbetsmarknad").
- keywords: Array of 5-15 specific keywords in Swedish relevant for search and linking.
- outcome_status: One of "enacted", "rejected", "pending", "superseded", "unknown".

Rules:
- Write everything in Swedish.
- Be factual and specific. No filler text.
- If the document text is too short or unclear to summarize, still produce your best effort with "unknown" for outcome_status.
- Return ONLY valid JSON, no markdown fences.`;

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[Texten har trunkerats]";
}

async function summarizeDocument(
  rawContent: string,
  title: string,
  docType: string,
  docNumber: string,
  apiKey: string
): Promise<SummaryResult> {
  const userPrompt = `Dokument: ${docNumber} - ${title} (typ: ${docType})\n\n${truncateText(rawContent, MAX_INPUT_CHARS)}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: SUMMARY_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content in OpenAI response");

  const parsed = JSON.parse(content) as SummaryResult;

  // Validate required fields
  if (!parsed.summary_text || typeof parsed.summary_text !== "string") {
    throw new Error("Missing or invalid summary_text in response");
  }

  return {
    summary_text: parsed.summary_text,
    policy_aim: parsed.policy_aim || "",
    core_recommendations: Array.isArray(parsed.core_recommendations) ? parsed.core_recommendations : [],
    key_actors: Array.isArray(parsed.key_actors) ? parsed.key_actors : [],
    policy_domains: Array.isArray(parsed.policy_domains) ? parsed.policy_domains : [],
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    outcome_status: ["enacted", "rejected", "pending", "superseded", "unknown"].includes(parsed.outcome_status)
      ? parsed.outcome_status
      : "unknown",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY")!;

    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "batch"; // 'batch' | 'single'
    const batchSize = body.batch_size || BATCH_SIZE;
    const documentId = body.document_id; // for single mode

    if (mode === "single" && documentId) {
      // Summarize a single document
      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .select("id, title, doc_type, doc_number, raw_content")
        .eq("id", documentId)
        .single();

      if (docErr || !doc) {
        return new Response(JSON.stringify({ error: "Document not found", details: docErr?.message }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!doc.raw_content) {
        return new Response(JSON.stringify({ error: "Document has no text content" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const summary = await summarizeDocument(doc.raw_content, doc.title, doc.doc_type, doc.doc_number, openaiKey);

      const { error: upsertErr } = await supabase.from("document_summaries").upsert(
        {
          document_id: doc.id,
          summary_text: summary.summary_text,
          policy_aim: summary.policy_aim,
          core_recommendations: summary.core_recommendations,
          key_actors: summary.key_actors,
          policy_domains: summary.policy_domains,
          keywords: summary.keywords,
          outcome_status: summary.outcome_status,
          model_version: MODEL_VERSION,
        },
        { onConflict: "document_id" }
      );

      if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`);

      return new Response(JSON.stringify({ success: true, document_id: doc.id, summary }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Batch mode: find documents with text but no summary
    const { data: docs, error: fetchErr } = await supabase
      .from("documents")
      .select("id, title, doc_type, doc_number, raw_content")
      .not("raw_content", "is", null)
      .not("raw_content", "eq", "")
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);

    // Filter out docs that already have summaries at current model version
    const docIds = (docs || []).map((d: any) => d.id);
    const { data: existingSummaries } = await supabase
      .from("document_summaries")
      .select("document_id")
      .in("document_id", docIds)
      .eq("model_version", MODEL_VERSION);

    const existingIds = new Set((existingSummaries || []).map((s: any) => s.document_id));
    const toProcess = (docs || []).filter((d: any) => !existingIds.has(d.id));

    if (toProcess.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No documents to summarize", processed: 0, skipped: docIds.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: { id: string; status: string; error?: string }[] = [];

    for (const doc of toProcess) {
      try {
        if (!doc.raw_content) {
          results.push({ id: doc.id, status: "skipped", error: "no content" });
          continue;
        }

        const summary = await summarizeDocument(doc.raw_content, doc.title, doc.doc_type, doc.doc_number, openaiKey);

        const { error: upsertErr } = await supabase.from("document_summaries").upsert(
          {
            document_id: doc.id,
            summary_text: summary.summary_text,
            policy_aim: summary.policy_aim,
            core_recommendations: summary.core_recommendations,
            key_actors: summary.key_actors,
            policy_domains: summary.policy_domains,
            keywords: summary.keywords,
            outcome_status: summary.outcome_status,
            model_version: MODEL_VERSION,
          },
          { onConflict: "document_id" }
        );

        if (upsertErr) {
          results.push({ id: doc.id, status: "error", error: upsertErr.message });
        } else {
          results.push({ id: doc.id, status: "success" });
        }
      } catch (err) {
        results.push({ id: doc.id, status: "error", error: err instanceof Error ? err.message : String(err) });
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    return new Response(
      JSON.stringify({
        success: true,
        processed: toProcess.length,
        succeeded: successCount,
        errors: errorCount,
        skipped: docIds.length - toProcess.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-document-summary error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
