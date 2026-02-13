import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUMMARY_MODEL = "gpt-4o-mini";
const MODEL_VERSION = "gpt-4o-v2";
const BATCH_SIZE = 10;
const MAX_INPUT_CHARS = 80000;

// ---------- Types ----------

interface SummaryResult {
  summary_text: string;
  policy_aim: string;
  core_recommendations: string[];
  proposals_not_adopted: string[];
  proposal_count: number | null;
  key_actors: { name: string; role: string }[];
  policy_domains: string[];
  keywords: string[];
  outcome_status: string;
}

// ---------- Section Extraction ----------

/**
 * Extract the semantically richest content from a Swedish government document.
 *
 * Strategy:
 *  - SOU / Proposition: locate "Sammanfattning" body (after TOC), extract it + TOC headings
 *  - Committee report: first 80K chars (fits most fully)
 *  - Directive / Law: full text (small documents)
 *  - Fallback: first 80K chars
 */
function extractKeyContent(rawContent: string, docType: string): { text: string; strategy: string } {
  const len = rawContent.length;

  // Small documents: send full text
  if (len <= MAX_INPUT_CHARS) {
    return { text: rawContent, strategy: "full_text" };
  }

  // For directives and laws, always try full text (they should be small)
  if (docType === "dir" || docType === "law") {
    return { text: rawContent.slice(0, MAX_INPUT_CHARS), strategy: "full_text_truncated" };
  }

  // For committee reports, take first 80K
  if (docType === "bet") {
    return { text: rawContent.slice(0, MAX_INPUT_CHARS), strategy: "first_80k" };
  }

  // SOU and Proposition: try to find Sammanfattning section body
  const extracted = extractSammanfattning(rawContent);
  if (extracted) {
    const toc = extractTOC(rawContent);
    // Put Sammanfattning FIRST so the model reads proposals before TOC structure
    const combined = toc
      ? `[SAMMANFATTNING]\n${extracted}\n\n[INNEHÅLLSFÖRTECKNING (för strukturell kontext)]\n${toc}`
      : `[SAMMANFATTNING]\n${extracted}`;

    // Cap at MAX_INPUT_CHARS
    if (combined.length <= MAX_INPUT_CHARS) {
      return { text: combined, strategy: "sammanfattning_with_toc" };
    }
    return { text: combined.slice(0, MAX_INPUT_CHARS), strategy: "sammanfattning_truncated" };
  }

  // Fallback: first 80K
  return { text: rawContent.slice(0, MAX_INPUT_CHARS), strategy: "fallback_first_80k" };
}

/**
 * Locate the body of the "Sammanfattning" section in Swedish government documents.
 *
 * Strategy: find all standalone "Sammanfattning" headings, then pick the one
 * that has the most substantial body text (>500 chars). This avoids picking
 * TOC entries or appendix (Bilaga) headings.
 */
function extractSammanfattning(text: string): string | null {
  const headingPattern = /^(?:\d+\s+)?Sammanfattning\s*$/gim;
  const matches: number[] = [];

  let match: RegExpExecArray | null;
  while ((match = headingPattern.exec(text)) !== null) {
    matches.push(match.index);
  }

  if (matches.length === 0) return null;

  // Try each match and pick the one with the longest body text
  // (the real Sammanfattning is 10-40K chars; appendix ones are short)
  let bestBody: string | null = null;
  let bestLength = 0;

  for (const matchPos of matches) {
    // Skip matches that appear in appendix area (after 80% of doc)
    if (matchPos > text.length * 0.8) continue;

    const headingEnd = text.indexOf("\n", matchPos);
    if (headingEnd === -1) continue;
    const bodyStart = headingEnd + 1;

    // Find end: next major chapter heading
    const endPattern = /^(?:Författningsförslag|Förslag till riksdagsbeslut|Summary|1\s+[A-ZÅÄÖ])/m;
    const endMatch = endPattern.exec(text.slice(bodyStart));

    let bodyEnd: number;
    if (endMatch) {
      bodyEnd = bodyStart + endMatch.index;
    } else {
      bodyEnd = Math.min(bodyStart + 60000, text.length);
    }

    const body = text.slice(bodyStart, bodyEnd).trim();

    // Pick the match with the longest body (the real Sammanfattning)
    if (body.length > 500 && body.length > bestLength) {
      bestBody = body;
      bestLength = body.length;
    }
  }

  return bestBody;
}

/**
 * Extract table of contents headings from the document.
 * Looks for numbered chapter headings in the first portion of the document.
 */
function extractTOC(text: string): string | null {
  // TOC is typically in the first 10K-20K chars
  const tocRegion = text.slice(0, 20000);

  // Find "Innehåll" or "Innehållsförteckning" heading
  const tocStart = tocRegion.search(/^(?:Innehåll|Innehållsförteckning)\s*$/im);
  if (tocStart === -1) return null;

  // Extract from there until we hit the first major content section
  const afterToc = tocRegion.slice(tocStart);
  const tocEnd = afterToc.search(/^(?:Sammanfattning|Författningsförslag|1\s+[A-ZÅÄÖ])/m);

  const tocText = tocEnd > 0 ? afterToc.slice(0, tocEnd).trim() : afterToc.slice(0, 5000).trim();

  // Filter to lines that look like chapter headings (numbered or short capitalized)
  const lines = tocText.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    // Keep numbered headings and short descriptive lines
    return /^\d+(\.\d+)*\s+/.test(trimmed) || /^[A-ZÅÄÖ]/.test(trimmed);
  });

  if (lines.length < 3) return null;

  // Cap TOC at ~5K chars
  let result = "";
  for (const line of lines) {
    if (result.length + line.length > 5000) break;
    result += line + "\n";
  }

  return result.trim();
}

// ---------- Prompt ----------

const SYSTEM_PROMPT = `You are a Swedish legislative policy analyst. Given content extracted from a Swedish government document (SOU, proposition, directive, committee report, or law), produce a structured summary in Swedish.

The input may contain:
- A "[INNEHÅLLSFÖRTECKNING]" (table of contents) section showing the document's structure
- A "[SAMMANFATTNING]" (executive summary) section containing the document's own distilled summary
- Or the full/partial document text

If a Sammanfattning section is provided, treat it as authoritative for the document's conclusions and proposals. It is written by the committee/author specifically to capture all key proposals and assessments.

Your output MUST be a JSON object with these fields:
- summary_text: A 300-600 word summary in Swedish covering the document's purpose, key proposals, and conclusions. Be specific about mechanisms and details. Focus on WHAT is proposed, not on what the mandate was.
- policy_aim: One sentence describing the policy goal.
- core_recommendations: Array of 3-15 key formal proposals (förslag) that the document actually puts forward. Each string should describe a SPECIFIC legislative or regulatory change, not a general task or goal. Example of GOOD: "Kommunen ska i översiktsplanen redovisa vilka klimatanpassningsåtgärder kommunen avser att initiera." Example of BAD: "Identifiera hinder mot klimatanpassningsåtgärder." (this is a mandate task, not a proposal).
- proposals_not_adopted: Array of items the inquiry explicitly considered but decided against, or assessed as outside the mandate. This prevents misattribution.
- proposal_count: Integer count of formal legislative proposals (from Författningsförslag chapter), or null if not determinable. If the document states "vi lämnar X förslag", use that number.
- key_actors: Array of objects {name, role} for key people/organizations mentioned.
- policy_domains: Array of 2-5 policy domain tags in Swedish (e.g. "utbildning", "miljö", "hälsa", "arbetsmarknad").
- keywords: Array of 5-15 specific keywords in Swedish relevant for search and linking.
- outcome_status: One of "enacted", "rejected", "pending", "superseded", "unknown".

CRITICAL RULES:
- Write everything in Swedish.
- Be factual and specific. No filler text.
- MANDATORY: Read the ENTIRE Sammanfattning section carefully before generating output. Do not stop after the first few paragraphs.
- The first 1-3 paragraphs of a Sammanfattning describe the inquiry's MANDATE (uppdrag) — what it was tasked to investigate ("Vi har haft i uppdrag att..."). These are BACKGROUND, not proposals. SKIP past the mandate description to find the actual proposals.
- Look for phrases like "Vi föreslår", "Vi lämnar förslag", "Förslagen innebär", "Vi lämnar X förslag" — these introduce the actual proposals that belong in core_recommendations.
- Each core_recommendation should describe a SPECIFIC legislative change. Example: "Kommunen ska i översiktsplanen redovisa vilka klimatanpassningsåtgärder kommunen avser att initiera" — NOT "Förbättra kommunernas möjligheter".
- If the text says "vi lämnar elva förslag" or similar, your core_recommendations should reflect approximately that many distinct proposals.
- Distinguish sharply between formal proposals (förslag) and assessments/conclusions that did NOT result in proposals (bedömningar som inte lett till förslag).
- If the document explicitly states that something is NOT proposed, lacks grounds for, or is outside the mandate, list it under proposals_not_adopted, NOT core_recommendations.
- Phrases like "det saknas skäl att införa", "det inte ingår i uppdraget", "vi bedömer att det inte finns anledning" signal proposals_not_adopted items.
- If the document text is too short or unclear to summarize, still produce your best effort with "unknown" for outcome_status.
- Return ONLY valid JSON, no markdown fences.`;

// ---------- Summarize ----------

async function summarizeDocument(
  rawContent: string,
  title: string,
  docType: string,
  docNumber: string,
  apiKey: string,
  options: { modelOverride?: string; twoPass?: boolean } = {}
): Promise<SummaryResult & { extraction_strategy: string; model_used: string; input_chars: number }> {
  const { text: extractedText, strategy } = extractKeyContent(rawContent, docType);
  const modelToUse = options.modelOverride || SUMMARY_MODEL;

  let finalPromptText = extractedText;

  // Two-pass mode: first extract proposals, then summarize
  if (options.twoPass) {
    console.log(`Two-pass mode: extracting proposals first with ${modelToUse}...`);
    const extractionPrompt = `Läs igenom hela texten nedan noggrant. Lista ALLA konkreta lagförslag (förslag) som dokumentet faktiskt lägger fram. Skippa mandatbeskrivning ("vi har haft i uppdrag att..."). Fokusera på fraser som "Vi föreslår", "Vi lämnar förslag", "Förslagen innebär".

Lista också separat saker som utredningen övervägde men INTE föreslog (med fraser som "det saknas skäl att införa", "det ingår inte i uppdraget").

Svara med en numrerad lista, på svenska. Var specifik om varje förslags innehåll.

Dokument: ${docNumber} - ${title}

${extractedText}`;

    const pass1Response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: [
          { role: "system", content: "Du är en svensk lagstiftningsanalytiker. Extrahera konkreta förslag ur betänkanden. Var noggrann och läs hela texten." },
          { role: "user", content: extractionPrompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!pass1Response.ok) {
      const errText = await pass1Response.text();
      throw new Error(`OpenAI pass-1 error ${pass1Response.status}: ${errText}`);
    }

    const pass1Data = await pass1Response.json();
    const proposalList = pass1Data.choices?.[0]?.message?.content || "";
    console.log(`Pass 1 extracted ${proposalList.length} chars of proposals`);

    // Pass 2: use the extracted proposals as input for structured summary
    finalPromptText = `EXTRAHERADE FÖRSLAG (från pass 1):\n${proposalList}\n\nORIGINALTEXT (för kontext):\n${extractedText.slice(0, 20000)}`;
  }

  const userPrompt = `Dokument: ${docNumber} - ${title} (typ: ${docType})\n\n${finalPromptText}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelToUse,
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

  if (!parsed.summary_text || typeof parsed.summary_text !== "string") {
    throw new Error("Missing or invalid summary_text in response");
  }

  return {
    summary_text: parsed.summary_text,
    policy_aim: parsed.policy_aim || "",
    core_recommendations: Array.isArray(parsed.core_recommendations) ? parsed.core_recommendations : [],
    proposals_not_adopted: Array.isArray(parsed.proposals_not_adopted) ? parsed.proposals_not_adopted : [],
    proposal_count: typeof parsed.proposal_count === "number" ? parsed.proposal_count : null,
    key_actors: Array.isArray(parsed.key_actors) ? parsed.key_actors : [],
    policy_domains: Array.isArray(parsed.policy_domains) ? parsed.policy_domains : [],
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : [],
    outcome_status: ["enacted", "rejected", "pending", "superseded", "unknown"].includes(parsed.outcome_status)
      ? parsed.outcome_status
      : "unknown",
    extraction_strategy: strategy,
    model_used: modelToUse,
    input_chars: finalPromptText.length,
  };
}

// ---------- Upsert helper ----------

function buildUpsertRow(docId: string, summary: SummaryResult) {
  return {
    document_id: docId,
    summary_text: summary.summary_text,
    policy_aim: summary.policy_aim,
    core_recommendations: summary.core_recommendations,
    proposals_not_adopted: summary.proposals_not_adopted,
    proposal_count: summary.proposal_count,
    key_actors: summary.key_actors,
    policy_domains: summary.policy_domains,
    keywords: summary.keywords,
    outcome_status: summary.outcome_status,
    model_version: MODEL_VERSION,
  };
}

// ---------- Handler ----------

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
    const mode = body.mode || "batch";
    const batchSize = Math.min(body.batch_size || BATCH_SIZE, 100);
    const documentId = body.document_id;
    const modelOverride = body.model; // e.g. "gpt-4-turbo", "gpt-4o-mini"
    const twoPass = body.two_pass === true;
    const debug = body.debug === true;

    // ---------- Debug mode: show extracted text without calling AI ----------
    if (mode === "debug" && documentId) {
      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .select("id, title, doc_type, doc_number, raw_content")
        .eq("id", documentId)
        .single();

      if (docErr || !doc) {
        return new Response(JSON.stringify({ error: "Document not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { text, strategy } = extractKeyContent(doc.raw_content || "", doc.doc_type);
      return new Response(JSON.stringify({
        document_id: doc.id,
        doc_number: doc.doc_number,
        doc_type: doc.doc_type,
        raw_content_length: (doc.raw_content || "").length,
        extracted_text_length: text.length,
        extraction_strategy: strategy,
        extracted_text_preview: text.slice(0, 3000),
        extracted_text_end: text.slice(-1000),
        system_prompt_length: SYSTEM_PROMPT.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ---------- Single mode ----------
    if (mode === "single" && documentId) {
      const { data: doc, error: docErr } = await supabase
        .from("documents")
        .select("id, title, doc_type, doc_number, raw_content")
        .eq("id", documentId)
        .single();

      if (docErr || !doc) {
        return new Response(JSON.stringify({ error: "Document not found", details: docErr?.message }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!doc.raw_content) {
        return new Response(JSON.stringify({ error: "Document has no text content" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const summary = await summarizeDocument(doc.raw_content, doc.title, doc.doc_type, doc.doc_number, openaiKey, {
        modelOverride,
        twoPass,
      });

      if (!debug) {
        const { error: upsertErr } = await supabase
          .from("document_summaries")
          .upsert(buildUpsertRow(doc.id, summary), { onConflict: "document_id" });
        if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`);
      }

      return new Response(
        JSON.stringify({ success: true, document_id: doc.id, model_used: summary.model_used, input_chars: summary.input_chars, extraction_strategy: summary.extraction_strategy, summary }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---------- Batch mode ----------
    // Build a balanced sample across doc types (Max's requirement: good mix)
    const docTypes = ["sou", "prop", "bet", "dir", "law"];
    const perType = Math.max(Math.floor(batchSize / docTypes.length), 1);
    const remainder = batchSize - perType * docTypes.length;

    let allDocs: any[] = [];

    for (let i = 0; i < docTypes.length; i++) {
      const limit = perType + (i < remainder ? 1 : 0);
      const { data: typeDocs } = await supabase
        .from("documents")
        .select("id, title, doc_type, doc_number, raw_content")
        .eq("doc_type", docTypes[i])
        .not("raw_content", "is", null)
        .not("raw_content", "eq", "")
        .order("created_at", { ascending: true })
        .limit(limit);

      if (typeDocs) allDocs = allDocs.concat(typeDocs);
    }

    // Filter out docs already summarized at current model version
    const docIds = allDocs.map((d: any) => d.id);
    const { data: existingSummaries } = await supabase
      .from("document_summaries")
      .select("document_id")
      .in("document_id", docIds)
      .eq("model_version", MODEL_VERSION);

    const existingIds = new Set((existingSummaries || []).map((s: any) => s.document_id));
    const toProcess = allDocs.filter((d: any) => !existingIds.has(d.id));

    if (toProcess.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No documents to summarize", processed: 0, skipped: docIds.length }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: { id: string; doc_number: string; doc_type: string; status: string; strategy?: string; error?: string }[] = [];

    for (const doc of toProcess) {
      try {
        if (!doc.raw_content) {
          results.push({ id: doc.id, doc_number: doc.doc_number, doc_type: doc.doc_type, status: "skipped", error: "no content" });
          continue;
        }

        const summary = await summarizeDocument(doc.raw_content, doc.title, doc.doc_type, doc.doc_number, openaiKey);

        const { error: upsertErr } = await supabase
          .from("document_summaries")
          .upsert(buildUpsertRow(doc.id, summary), { onConflict: "document_id" });

        if (upsertErr) {
          results.push({ id: doc.id, doc_number: doc.doc_number, doc_type: doc.doc_type, status: "error", error: upsertErr.message });
        } else {
          results.push({ id: doc.id, doc_number: doc.doc_number, doc_type: doc.doc_type, status: "success", strategy: summary.extraction_strategy });
        }
      } catch (err) {
        results.push({
          id: doc.id,
          doc_number: doc.doc_number,
          doc_type: doc.doc_type,
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
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
