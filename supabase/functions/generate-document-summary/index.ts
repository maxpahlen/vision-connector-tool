import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUMMARY_MODEL_DEFAULT = "gpt-4o-mini";
const SUMMARY_MODEL_COMPLEX = "gpt-4o-2024-08-06";
const COMPLEX_DOC_TYPES = new Set(["directive"]);
const MODEL_VERSION = "gpt-4o-v3-hybrid";
const BATCH_SIZE = 10;
const MAX_INPUT_CHARS = 80000;

/** Select model based on document type — complex types get gpt-4o for completeness */
function selectModel(docType: string, override?: string): string {
  if (override) return override;
  const canonical = normalizeDocType(docType);
  return COMPLEX_DOC_TYPES.has(canonical) ? SUMMARY_MODEL_COMPLEX : SUMMARY_MODEL_DEFAULT;
}

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
  if (docType === "directive" || docType === "dir" || docType === "law") {
    return { text: rawContent.slice(0, MAX_INPUT_CHARS), strategy: "full_text_truncated" };
  }

  // For committee reports, take first 80K
  if (docType === "committee_report" || docType === "bet") {
    return { text: rawContent.slice(0, MAX_INPUT_CHARS), strategy: "first_80k" };
  }

  // SOU and Proposition: try to find Sammanfattning section body
  const extracted = extractSammanfattning(rawContent);
  if (extracted) {
    const toc = extractTOC(rawContent);
    const combined = toc
      ? `[SAMMANFATTNING]\n${extracted}\n\n[INNEHÅLLSFÖRTECKNING (för strukturell kontext)]\n${toc}`
      : `[SAMMANFATTNING]\n${extracted}`;

    if (combined.length <= MAX_INPUT_CHARS) {
      return { text: combined, strategy: "sammanfattning_with_toc" };
    }
    return { text: combined.slice(0, MAX_INPUT_CHARS), strategy: "sammanfattning_truncated" };
  }

  return { text: rawContent.slice(0, MAX_INPUT_CHARS), strategy: "fallback_first_80k" };
}

function extractSammanfattning(text: string): string | null {
  const headingPattern = /^(?:\d+\s+)?Sammanfattning\s*$/gim;
  const matches: number[] = [];

  let match: RegExpExecArray | null;
  while ((match = headingPattern.exec(text)) !== null) {
    matches.push(match.index);
  }

  if (matches.length === 0) return null;

  let bestBody: string | null = null;
  let bestLength = 0;

  for (const matchPos of matches) {
    if (matchPos > text.length * 0.8) continue;

    const headingEnd = text.indexOf("\n", matchPos);
    if (headingEnd === -1) continue;
    const bodyStart = headingEnd + 1;

    const endPattern = /^(?:Författningsförslag|Förslag till riksdagsbeslut|Summary|1\s+[A-ZÅÄÖ])/m;
    const endMatch = endPattern.exec(text.slice(bodyStart));

    let bodyEnd: number;
    if (endMatch) {
      bodyEnd = bodyStart + endMatch.index;
    } else {
      bodyEnd = Math.min(bodyStart + 60000, text.length);
    }

    const body = text.slice(bodyStart, bodyEnd).trim();

    if (body.length > 500 && body.length > bestLength) {
      bestBody = body;
      bestLength = body.length;
    }
  }

  return bestBody;
}

function extractTOC(text: string): string | null {
  const tocRegion = text.slice(0, 20000);

  const tocStart = tocRegion.search(/^(?:Innehåll|Innehållsförteckning)\s*$/im);
  if (tocStart === -1) return null;

  const afterToc = tocRegion.slice(tocStart);
  const tocEnd = afterToc.search(/^(?:Sammanfattning|Författningsförslag|1\s+[A-ZÅÄÖ])/m);

  const tocText = tocEnd > 0 ? afterToc.slice(0, tocEnd).trim() : afterToc.slice(0, 5000).trim();

  const lines = tocText.split("\n").filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    return /^\d+(\.\d+)*\s+/.test(trimmed) || /^[A-ZÅÄÖ]/.test(trimmed);
  });

  if (lines.length < 3) return null;

  let result = "";
  for (const line of lines) {
    if (result.length + line.length > 5000) break;
    result += line + "\n";
  }

  return result.trim();
}

// ---------- Per-Type Prompt System ----------

const BASE_PROMPT = `You are a Swedish legislative policy analyst. Given content extracted from a Swedish government document, produce a structured summary in Swedish.

The input may contain:
- A "[INNEHÅLLSFÖRTECKNING]" (table of contents) section showing the document's structure
- A "[SAMMANFATTNING]" (executive summary) section containing the document's own distilled summary
- Or the full/partial document text

Your output MUST be a JSON object with these fields:
- summary_text: A 300-600 word summary in Swedish. Be specific about mechanisms and details.
- policy_aim: One sentence describing the policy goal or purpose.
- core_recommendations: Array of strings (see doc-type-specific instructions below for what to put here).
- proposals_not_adopted: Array of strings (see doc-type-specific instructions below).
- proposal_count: Integer or null (see doc-type-specific instructions below).
- key_actors: Array of objects {name, role} for key people/organizations mentioned.
- policy_domains: Array of 2-5 policy domain tags in Swedish (e.g. "utbildning", "miljö", "hälsa").
- keywords: Array of 5-15 specific keywords in Swedish relevant for search and linking.
- outcome_status: One of "enacted", "rejected", "pending", "superseded", "unknown".

UNIVERSAL RULES:
- Write everything in Swedish.
- Be factual and specific. No filler text.
- Read the ENTIRE input carefully before generating output.
- Return ONLY valid JSON, no markdown fences.`;

const DOC_TYPE_INSTRUCTIONS: Record<string, string> = {
  sou: `
DOC-TYPE: SOU (Statens offentliga utredningar)

An SOU is a government inquiry report that investigates a policy area and proposes legislative changes.

FIELD INSTRUCTIONS:
- core_recommendations: Array of 3-15 key formal proposals (förslag) that the document puts forward. Each string should describe a SPECIFIC legislative or regulatory change. Example of GOOD: "Kommunen ska i översiktsplanen redovisa vilka klimatanpassningsåtgärder kommunen avser att initiera." Example of BAD: "Identifiera hinder mot klimatanpassningsåtgärder."
- proposals_not_adopted: Array of items the inquiry explicitly considered but decided against, or assessed as outside the mandate. Phrases like "det saknas skäl att införa", "det inte ingår i uppdraget" signal these items.
- proposal_count: Integer count of formal legislative proposals (from Författningsförslag chapter), or null if not determinable. If the document states "vi lämnar X förslag", use that number. Do NOT count sub-proposals yourself.
- outcome_status: Usually "pending" or "unknown" for SOUs.

CRITICAL EXTRACTION RULES:
- The first 1-3 paragraphs of a Sammanfattning describe the inquiry's MANDATE (uppdrag). These are BACKGROUND, not proposals. SKIP past the mandate description to find the actual proposals.
- Look for phrases like "Vi föreslår", "Vi lämnar förslag", "Förslagen innebär", "Vi lämnar X förslag".
- Each core_recommendation should describe a SPECIFIC legislative change, not a general goal.
- EXHAUSTIVE EXTRACTION: Capture ALL distinct proposals, including:
  * Dispensregler / undantag (e.g. strandskyddsdispens, bygglovsdispens)
  * Informationsskyldigheter for different actors (each actor's duty is a SEPARATE proposal)
  * Dimensioneringskrav / tekniska standarder (e.g. dagvattensystem ska dimensioneras för tioårsregn)
  * Ändringar i befintliga lagar (PBL, MB, ledningsrättslagen, vattentjänstlagen, etc.)
  * Nya lagar eller förordningar
  * Myndighetsuppdrag och bemyndiganden
- Do NOT merge multiple distinct proposals into one vague recommendation.
- Distinguish sharply between formal proposals (förslag) and assessments/conclusions that did NOT result in proposals (bedömningar).`,

  proposition: `
DOC-TYPE: Proposition (Regeringsproposition)

A proposition is a government bill submitted to Parliament proposing specific legislative changes.

FIELD INSTRUCTIONS:
- core_recommendations: Array of 3-15 key legislative proposals the government puts forward. Each should describe a SPECIFIC change. Focus on "Regeringen föreslår" statements.
- proposals_not_adopted: Array of items explicitly considered but not included in the proposition (e.g. remiss feedback that was rejected, SOU proposals not carried forward).
- proposal_count: Integer count of formal proposals, or null if not determinable.
- outcome_status: "pending" if not yet decided by Parliament, "enacted" if known to have passed, "rejected" if voted down.

CRITICAL RULES:
- Focus on WHAT the government proposes, not the background analysis.
- Look for "Regeringen föreslår", "Förslag till riksdagsbeslut", "Propositionen innehåller förslag".
- If based on an SOU, note which SOU proposals were adopted vs. modified vs. dropped.
- EXHAUSTIVE EXTRACTION applies: capture all distinct proposals including amendments to multiple laws.`,

  directive: `
DOC-TYPE: Kommittédirektiv (Directive)

A directive instructs a government inquiry (utredning) about what to investigate. It does NOT contain legislative proposals — it defines the inquiry's mandate and questions.

FIELD INSTRUCTIONS:
- core_recommendations: List the specific MANDATE TASKS and QUESTIONS the inquiry must address. These are NOT proposals — they are assignments. Example: "Utredaren ska föreslå hur kommunernas ansvar för klimatanpassning kan förtydligas."
- proposals_not_adopted: List explicit SCOPE LIMITATIONS — what is outside the mandate. Look for phrases like "Uppdraget omfattar inte", "Utredaren ska inte", "Frågan om X ingår inte i uppdraget."
- proposal_count: Always null. Directives do not contain proposals.
- outcome_status: Always "pending" — a directive initiates work that has not yet concluded.

CRITICAL RULES:
- Do NOT describe mandate tasks as "proposals" or "recommendations" in the summary_text. Use words like "uppdraget omfattar", "utredaren ska", "frågor som ska belysas".
- Capture the DEADLINE (redovisningsdatum / "Uppdraget ska redovisas senast") in the summary_text.
- Identify the inquiry chair (särskild utredare) in key_actors if mentioned.
- Note any additional directives (tilläggsdirektiv) if referenced.`,

  committee_report: `
DOC-TYPE: Betänkande (Committee Report)

A committee report (betänkande) is produced by a parliamentary committee (utskott) evaluating a government proposition and any associated motions. The committee recommends whether Parliament should approve, modify, or reject the proposals.

FIELD INSTRUCTIONS:
- core_recommendations: List the committee's formal POSITIONS (ställningstaganden). Include:
  * Whether the committee recommends approval (bifall) or rejection (avslag) of the proposition
  * Any tillkännagivanden (formal parliamentary directives to the government)
  * Modifications the committee proposes to the original bill
- proposals_not_adopted: List RESERVATIONER (dissenting opinions) with party attribution. Format: "[Party/parties]: [Their position]". Example: "SD: Avslag på propositionen i sin helhet."
- proposal_count: Number of tillkännagivanden, or null if none.
- outcome_status: "enacted" if the committee recommends bifall, "rejected" if avslag, "pending" if not yet voted on.

CRITICAL RULES:
- Focus on the COMMITTEE'S STANCE, not just restating the proposition.
- Clearly state whether the committee supports or opposes each major element.
- Capture the vote outcome if stated (e.g. "Utskottet föreslår att riksdagen bifaller proposition X").
- List ALL reservationer — each party/group that dissents should be captured with their specific objection.
- Note any motioner that were considered alongside the proposition.`,

  law: `
DOC-TYPE: Lag / Förordning (Law / Regulation)

This is enacted legislation. It IS the law — it does not "propose" anything.

FIELD INSTRUCTIONS:
- core_recommendations: List the KEY PROVISIONS and obligations the law establishes. Each entry should describe what the law requires, permits, or prohibits. Example: "Arbetsgivare med fler än 25 anställda ska upprätta en jämställdhetsplan." Do NOT use words like "föreslår" — say "föreskriver", "kräver", "stadgar".
- proposals_not_adopted: Empty array []. Not applicable for enacted law.
- proposal_count: null. Not applicable.
- outcome_status: Always "enacted".

CRITICAL RULES:
- Describe provisions as ACTIVE LAW, not proposals. Use present tense.
- Capture the EFFECTIVE DATE (ikraftträdande) in the summary_text. Look for "Denna lag träder i kraft den..."
- Capture any TRANSITIONAL PROVISIONS (övergångsbestämmelser) if significant.
- Note which existing laws are amended or repealed (upphävda).
- Identify the regulated subjects (who must comply) and the regulatory authority (tillsynsmyndighet) if specified.`,
};

// Normalize doc_type variants to canonical keys
function normalizeDocType(docType: string): string {
  const mapping: Record<string, string> = {
    sou: "sou",
    proposition: "proposition",
    prop: "proposition",
    directive: "directive",
    dir: "directive",
    committee_report: "committee_report",
    bet: "committee_report",
    law: "law",
    lag: "law",
  };
  return mapping[docType.toLowerCase()] || "sou"; // fallback to SOU prompt
}

function buildSystemPrompt(docType: string): string {
  const canonical = normalizeDocType(docType);
  const typeBlock = DOC_TYPE_INSTRUCTIONS[canonical] || DOC_TYPE_INSTRUCTIONS["sou"];
  return `${BASE_PROMPT}\n\n${typeBlock}`;
}

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
  const modelToUse = selectModel(docType, options.modelOverride);
  const systemPrompt = buildSystemPrompt(docType);

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
        { role: "system", content: systemPrompt },
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
    const modelOverride = body.model;
    const twoPass = body.two_pass === true;
    const debug = body.debug === true;
    const docTypeFilter: string | undefined = body.doc_type; // optional: filter batch to single type

    // ---------- Debug mode ----------
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
      const systemPrompt = buildSystemPrompt(doc.doc_type);
      return new Response(JSON.stringify({
        document_id: doc.id,
        doc_number: doc.doc_number,
        doc_type: doc.doc_type,
        normalized_doc_type: normalizeDocType(doc.doc_type),
        raw_content_length: (doc.raw_content || "").length,
        extracted_text_length: text.length,
        extraction_strategy: strategy,
        extracted_text_preview: text.slice(0, 3000),
        extracted_text_end: text.slice(-1000),
        system_prompt_length: systemPrompt.length,
        system_prompt_preview: systemPrompt.slice(0, 500),
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
        JSON.stringify({ success: true, document_id: doc.id, doc_type: doc.doc_type, normalized_doc_type: normalizeDocType(doc.doc_type), model_used: summary.model_used, input_chars: summary.input_chars, extraction_strategy: summary.extraction_strategy, summary }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---------- Batch mode ----------
    // First, get all already-summarized document IDs for this model version
    const { data: allExisting } = await supabase
      .from("document_summaries")
      .select("document_id")
      .eq("model_version", MODEL_VERSION);
    const existingIds = new Set((allExisting || []).map((s: any) => s.document_id));

    const allDocTypes = ["sou", "proposition", "committee_report", "directive", "law"];
    const docTypes = docTypeFilter ? [docTypeFilter] : allDocTypes;
    const perType = Math.max(Math.floor(batchSize / docTypes.length), 1);
    const remainder = batchSize - perType * docTypes.length;

    let allDocs: any[] = [];

    for (let i = 0; i < docTypes.length; i++) {
      const needed = perType + (i < remainder ? 1 : 0);
      // Paginate to find enough unsummarized docs
      let collected: any[] = [];
      let offset = 0;
      const PAGE_SIZE = 50;

      while (collected.length < needed && offset < 5000) {
        const { data: typeDocs } = await supabase
          .from("documents")
          .select("id, title, doc_type, doc_number, raw_content")
          .eq("doc_type", docTypes[i])
          .not("raw_content", "is", null)
          .not("raw_content", "eq", "")
          .order("created_at", { ascending: true })
          .range(offset, offset + PAGE_SIZE - 1);

        if (!typeDocs || typeDocs.length === 0) break;

        for (const doc of typeDocs) {
          if (!existingIds.has(doc.id)) {
            collected.push(doc);
            if (collected.length >= needed) break;
          }
        }
        offset += PAGE_SIZE;
      }

      allDocs = allDocs.concat(collected);
    }

    const toProcess = allDocs;
    const skippedCount = existingIds.size;

    if (toProcess.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No documents to summarize", processed: 0, skipped: skippedCount }),
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
        skipped: skippedCount,
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
