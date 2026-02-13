import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMBEDDING_MODEL = "intfloat/multilingual-e5-large";
const DEEPINFRA_URL = "https://api.deepinfra.com/v1/openai/embeddings";
const BATCH_SIZE = 20;
const MAX_SUMMARY_CHARS = 1800; // ~450 tokens, safely under 512-token limit

/**
 * E5 models require a task prefix for optimal performance.
 * "passage: " for documents being indexed.
 */
function prepareE5Input(summaryText: string, policyAim: string, keywords: string[]): string {
  const keywordStr = keywords.length > 0 ? `\nNyckelord: ${keywords.join(", ")}` : "";
  const aimStr = policyAim ? `\n${policyAim}` : "";
  const combined = `passage: ${summaryText}${aimStr}${keywordStr}`;
  
  // Truncate to stay within 512-token input limit
  if (combined.length > MAX_SUMMARY_CHARS) {
    return combined.slice(0, MAX_SUMMARY_CHARS);
  }
  return combined;
}

async function generateEmbeddings(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  const response = await fetch(DEEPINFRA_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      encoding_format: "float",
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepInfra API error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  
  if (!data.data || !Array.isArray(data.data)) {
    throw new Error("Invalid response format from DeepInfra");
  }

  // Sort by index to maintain order
  const sorted = data.data.sort((a: any, b: any) => a.index - b.index);
  return sorted.map((item: any) => item.embedding);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const deepinfraKey = Deno.env.get("DEEPINFRA_API_KEY")!;

    if (!deepinfraKey) {
      return new Response(JSON.stringify({ error: "DEEPINFRA_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json().catch(() => ({}));
    const batchSize = body.batch_size || BATCH_SIZE;
    const documentId = body.document_id; // optional: embed a single document

    let query = supabase
      .from("document_summaries")
      .select("id, document_id, summary_text, policy_aim, keywords, embedding")
      .not("summary_text", "is", null)
      .is("embedding", null) // only docs without embeddings
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (documentId) {
      query = supabase
        .from("document_summaries")
        .select("id, document_id, summary_text, policy_aim, keywords, embedding")
        .eq("document_id", documentId)
        .limit(1);
    }

    const { data: summaries, error: fetchErr } = await query;

    if (fetchErr) throw new Error(`Fetch error: ${fetchErr.message}`);

    const toEmbed = documentId
      ? (summaries || []) // For single doc, always re-embed
      : (summaries || []).filter((s: any) => !s.embedding);

    if (toEmbed.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No summaries to embed", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prepare texts with E5 prefix
    const texts = toEmbed.map((s: any) =>
      prepareE5Input(s.summary_text, s.policy_aim || "", s.keywords || [])
    );

    // Generate embeddings in one batch call
    const embeddings = await generateEmbeddings(texts, deepinfraKey);

    if (embeddings.length !== toEmbed.length) {
      throw new Error(`Embedding count mismatch: got ${embeddings.length}, expected ${toEmbed.length}`);
    }

    // Validate first embedding dimension
    if (embeddings[0].length !== 1024) {
      throw new Error(`Unexpected embedding dimension: ${embeddings[0].length}, expected 1024`);
    }

    // Update each summary with its embedding
    const results: { id: string; status: string; error?: string }[] = [];

    for (let i = 0; i < toEmbed.length; i++) {
      const summary = toEmbed[i];
      const embedding = embeddings[i];

      // pgvector expects array format for vector type
      const embeddingStr = `[${embedding.join(",")}]`;

      const { error: updateErr } = await supabase
        .from("document_summaries")
        .update({ embedding: embeddingStr })
        .eq("id", summary.id);

      if (updateErr) {
        results.push({ id: summary.document_id, status: "error", error: updateErr.message });
      } else {
        results.push({ id: summary.document_id, status: "success" });
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const errorCount = results.filter((r) => r.status === "error").length;

    return new Response(
      JSON.stringify({
        success: true,
        processed: toEmbed.length,
        succeeded: successCount,
        errors: errorCount,
        embedding_dimension: embeddings[0]?.length || 0,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("generate-embeddings error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
