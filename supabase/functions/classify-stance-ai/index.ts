/**
 * Phase 5.6.4: AI-Assisted Stance Classification
 * 
 * Processes uncertain remissvar stances (neutral with 0 keywords + mixed)
 * using OpenAI tool calling for structured stance classification.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callOpenAI, DEFAULT_MODEL } from "../_shared/openai-client.ts";
import type OpenAI from "https://esm.sh/openai@4.68.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  response_id?: string;     // Optional: classify single response
  limit?: number;           // Batch size (default 20, max 50)
  dry_run?: boolean;        // Preview mode
  confidence_threshold?: 'high' | 'medium' | 'low';  // Auto-apply threshold (default: medium)
}

interface AIClassification {
  stance: 'support' | 'oppose' | 'conditional' | 'neutral';
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  key_phrases: string[];
}

interface ClassificationDetail {
  response_id: string;
  organization: string | null;
  original_stance: string;
  ai_stance: string;
  confidence: string;
  reasoning: string;
  auto_applied: boolean;
}

interface ClassificationResult {
  processed: number;
  classified: number;
  low_confidence: number;
  errors: Array<{ response_id: string; error: string }>;
  summary: {
    support: number;
    oppose: number;
    conditional: number;
    neutral: number;
  };
  details: ClassificationDetail[];
  dry_run: boolean;
}

// Confidence threshold ordering for comparison
const CONFIDENCE_ORDER = { high: 3, medium: 2, low: 1 };

function meetsThreshold(
  confidence: 'high' | 'medium' | 'low', 
  threshold: 'high' | 'medium' | 'low'
): boolean {
  return CONFIDENCE_ORDER[confidence] >= CONFIDENCE_ORDER[threshold];
}

// System prompt for Swedish remissvar classification
const SYSTEM_PROMPT = `Du analyserar svenska remissvar (consultation responses) till statliga utredningar (SOU).

Bestäm organisationens ställningstagande till förslagen:
- support: Organisationen tillstyrker/instämmer i förslaget
- oppose: Organisationen avstyrker/motsätter sig förslaget
- conditional: Stödjer med förbehåll, villkor eller reservationer
- neutral: Inga synpunkter, faller utanför verksamhetsområdet, eller irrelevant

Var uppmärksam på:
- Explicit ställningstagande i sammanfattning eller inledning
- Formuleringar som "vi instämmer", "vi tillstyrker", "vi avstyrker", "vi motsätter oss"
- Förbehåll som "under förutsättning att", "med förbehåll"
- "Inga synpunkter" eller "berörs ej" indikerar neutral

Om texten saknar tydligt ställningstagande, välj "neutral" med "low" confidence.`;

// Tool definition for structured output
const CLASSIFY_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: "function",
  function: {
    name: "classify_stance",
    description: "Classify the stance of a Swedish consultation response (remissvar)",
    parameters: {
      type: "object",
      properties: {
        stance: {
          type: "string",
          enum: ["support", "oppose", "conditional", "neutral"],
          description: "The overall stance of the organization toward the proposal",
        },
        confidence: {
          type: "string",
          enum: ["high", "medium", "low"],
          description: "Confidence level based on clarity of position in text",
        },
        reasoning: {
          type: "string",
          description: "Brief explanation in Swedish (1-2 sentences max)",
        },
        key_phrases: {
          type: "array",
          items: { type: "string" },
          description: "2-5 key phrases from the text that informed the decision",
        },
      },
      required: ["stance", "confidence", "reasoning", "key_phrases"],
    },
  },
};

/**
 * Extract summary section if present, otherwise use first N characters.
 * Summary-first strategy for better classification.
 */
function prepareText(rawContent: string, maxLength = 4000): string {
  if (!rawContent || rawContent.length === 0) return "";
  
  const lines = rawContent.split('\n');
  let summaryContent = "";
  let inSummarySection = false;
  let bodyContent = "";
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase().trim();
    
    // Detect summary section headers
    if (
      (lowerLine.includes('sammanfattning') || 
       lowerLine.includes('ställningstagande') ||
       lowerLine.includes('yttrande i korthet')) && 
      lowerLine.length < 60
    ) {
      inSummarySection = true;
      summaryContent += line + '\n';
      continue;
    }
    
    // End summary section on next major header
    if (inSummarySection && lowerLine.length < 50 && 
        (lowerLine.match(/^\d+\.\s/) || lowerLine.match(/^[A-ZÅÄÖ]{3,}/))) {
      inSummarySection = false;
    }
    
    if (inSummarySection) {
      summaryContent += line + '\n';
    } else {
      bodyContent += line + '\n';
    }
  }
  
  // Build final text: summary first (up to 1500 chars), then body
  let result = "";
  
  if (summaryContent.trim().length > 0) {
    result = summaryContent.slice(0, 1500);
    const remainingSpace = maxLength - result.length;
    if (remainingSpace > 500 && bodyContent.length > 0) {
      result += "\n\n---\n\n" + bodyContent.slice(0, remainingSpace - 100);
    }
  } else {
    // No summary found, use first portion of body
    result = rawContent.slice(0, maxLength);
  }
  
  return result.trim();
}

/**
 * Call OpenAI to classify a single document.
 */
async function classifyDocument(text: string): Promise<AIClassification | null> {
  if (!text || text.length < 50) return null;
  
  const userMessage = `Analysera följande remissvar och klassificera organisationens ställningstagande:\n\n${text}`;
  
  const response = await callOpenAI(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMessage },
    ],
    [CLASSIFY_TOOL],
    {
      model: DEFAULT_MODEL,
      temperature: 0.1,
      toolChoice: { type: "function", function: { name: "classify_stance" } },
      maxRetries: 2,
    }
  );
  
  // Extract tool call result
  const toolCall = response.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || toolCall.function.name !== "classify_stance") {
    return null;
  }
  
  try {
    const result = JSON.parse(toolCall.function.arguments) as AIClassification;
    return result;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let body: RequestBody = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is fine, use defaults
    }

    const { 
      response_id, 
      limit = 20, 
      dry_run = false,
      confidence_threshold = 'medium',
    } = body;

    // Clamp limit
    const effectiveLimit = Math.min(Math.max(1, limit), 50);

    console.log(`[classify-stance-ai] Starting: limit=${effectiveLimit}, dry_run=${dry_run}, threshold=${confidence_threshold}`);

    // Build query for eligible responses
    // Eligible = extraction ok, keyword analysis ok, (neutral with 0 keywords OR mixed), not yet AI processed
    let query = supabase
      .from("remiss_responses")
      .select("id, responding_organization, raw_content, stance_summary, stance_signals, metadata")
      .eq("extraction_status", "ok")
      .eq("analysis_status", "ok")
      .is("metadata->ai_review", null)
      .order("created_at", { ascending: true })
      .limit(effectiveLimit);

    if (response_id) {
      // Single response mode
      query = supabase
        .from("remiss_responses")
        .select("id, responding_organization, raw_content, stance_summary, stance_signals, metadata")
        .eq("id", response_id);
    }

    const { data: responses, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch responses: ${fetchError.message}`);
    }

    // Filter to eligible responses (neutral with 0 keywords OR mixed)
    const eligibleResponses = (responses || []).filter(r => {
      const signals = r.stance_signals as { keywords_found?: string[] } | null;
      const keywordsFound = signals?.keywords_found || [];
      
      // Already AI processed?
      const metadata = r.metadata as { ai_review?: unknown } | null;
      if (metadata?.ai_review) return false;
      
      // Neutral with no keywords
      if (r.stance_summary === 'neutral' && keywordsFound.length === 0) return true;
      
      // Mixed stance
      if (r.stance_summary === 'mixed') return true;
      
      return false;
    });

    if (eligibleResponses.length === 0) {
      console.log("[classify-stance-ai] No eligible responses found");
      return new Response(
        JSON.stringify({
          processed: 0,
          classified: 0,
          low_confidence: 0,
          errors: [],
          summary: { support: 0, oppose: 0, conditional: 0, neutral: 0 },
          details: [],
          dry_run,
          message: "No eligible responses (neutral with 0 keywords or mixed) found",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[classify-stance-ai] Found ${eligibleResponses.length} eligible responses`);

    const result: ClassificationResult = {
      processed: 0,
      classified: 0,
      low_confidence: 0,
      errors: [],
      summary: { support: 0, oppose: 0, conditional: 0, neutral: 0 },
      details: [],
      dry_run,
    };

    for (const response of eligibleResponses) {
      result.processed++;

      try {
        // Prepare text (summary-first strategy)
        const text = prepareText(response.raw_content || "", 4000);
        
        if (text.length < 50) {
          console.log(`[classify-stance-ai] Skipping ${response.id}: insufficient text`);
          result.errors.push({
            response_id: response.id,
            error: "Insufficient text content",
          });
          continue;
        }

        // Call OpenAI for classification
        const classification = await classifyDocument(text);
        
        if (!classification) {
          result.errors.push({
            response_id: response.id,
            error: "AI classification returned null",
          });
          continue;
        }

        // Check if meets confidence threshold for auto-apply
        const autoApply = meetsThreshold(classification.confidence, confidence_threshold);
        const newAnalysisStatus = autoApply ? 'ai_classified' : 'ai_low_confidence';

        // Update summary counts
        result.summary[classification.stance]++;
        
        if (autoApply) {
          result.classified++;
        } else {
          result.low_confidence++;
        }

        // Build AI review metadata
        const aiReview = {
          stance: classification.stance,
          confidence: classification.confidence,
          reasoning: classification.reasoning,
          key_phrases: classification.key_phrases,
          model: DEFAULT_MODEL,
          classified_at: new Date().toISOString(),
          original_stance: response.stance_summary,
          auto_applied: autoApply,
        };

        // Add to details
        result.details.push({
          response_id: response.id,
          organization: response.responding_organization,
          original_stance: response.stance_summary || 'unknown',
          ai_stance: classification.stance,
          confidence: classification.confidence,
          reasoning: classification.reasoning,
          auto_applied: autoApply,
        });

        // Update database (unless dry run)
        if (!dry_run) {
          const existingMetadata = (response.metadata as Record<string, unknown>) || {};
          
          const updateData: Record<string, unknown> = {
            metadata: {
              ...existingMetadata,
              ai_review: aiReview,
            },
            analysis_status: newAnalysisStatus,
          };
          
          // If auto-apply, also update stance_summary
          if (autoApply) {
            updateData.stance_summary = classification.stance;
          }

          const { error: updateError } = await supabase
            .from("remiss_responses")
            .update(updateData)
            .eq("id", response.id);

          if (updateError) {
            throw new Error(`Database update failed: ${updateError.message}`);
          }
        }

        console.log(
          `[classify-stance-ai] Classified ${response.id}: ${classification.stance} (${classification.confidence}) ${autoApply ? '[AUTO]' : '[LOW-CONF]'}`
        );

        // Small delay between API calls to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`[classify-stance-ai] Error classifying ${response.id}: ${errorMessage}`);
        
        result.errors.push({
          response_id: response.id,
          error: errorMessage,
        });
      }
    }

    console.log(
      `[classify-stance-ai] Complete: processed=${result.processed}, classified=${result.classified}, low_confidence=${result.low_confidence}, errors=${result.errors.length}`
    );

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[classify-stance-ai] Fatal error: ${errorMessage}`);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
