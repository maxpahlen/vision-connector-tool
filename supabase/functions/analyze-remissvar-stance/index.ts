/**
 * Phase 5.6.3: Analyze Remissvar Stance
 * 
 * Batch processes remissvar text to detect stance using Swedish keyword patterns.
 * Only processes responses where extraction_status = 'ok' AND analysis_status = 'not_started'.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { analyzeStance, type StanceSummary } from "../_shared/stance-analyzer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  response_id?: string;  // Optional: analyze single response
  limit?: number;        // Batch size (default 50)
  dry_run?: boolean;     // Preview mode
}

interface AnalysisDetail {
  response_id: string;
  responding_organization: string | null;
  stance_summary: StanceSummary;
  keywords_found: string[];
  word_count: number;
  section_context: string;
}

interface AnalysisResult {
  processed: number;
  analyzed: number;
  skipped: number;
  errors: Array<{ response_id: string; error: string }>;
  summary: {
    support: number;
    oppose: number;
    conditional: number;
    neutral: number;
    mixed: number;
  };
  details: AnalysisDetail[];
  dry_run: boolean;
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

    const { response_id, limit = 50, dry_run = false } = body;

    console.log(`[analyze-remissvar-stance] Starting analysis: limit=${limit}, dry_run=${dry_run}, response_id=${response_id || 'all'}`);

    // Build query - ONLY process responses where extraction succeeded
    let query = supabase
      .from("remiss_responses")
      .select("id, responding_organization, raw_content, extraction_status, analysis_status")
      .eq("extraction_status", "ok")
      .eq("analysis_status", "not_started")
      .order("created_at", { ascending: true })
      .limit(limit);

    // If specific response_id provided, filter to just that one
    if (response_id) {
      query = supabase
        .from("remiss_responses")
        .select("id, responding_organization, raw_content, extraction_status, analysis_status")
        .eq("id", response_id);
    }

    const { data: responses, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch responses: ${fetchError.message}`);
    }

    if (!responses || responses.length === 0) {
      console.log("[analyze-remissvar-stance] No responses to analyze");
      return new Response(
        JSON.stringify({
          processed: 0,
          analyzed: 0,
          skipped: 0,
          errors: [],
          summary: { support: 0, oppose: 0, conditional: 0, neutral: 0, mixed: 0 },
          details: [],
          dry_run,
          message: "No responses with extraction_status='ok' and analysis_status='not_started'"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[analyze-remissvar-stance] Found ${responses.length} responses to analyze`);

    const result: AnalysisResult = {
      processed: 0,
      analyzed: 0,
      skipped: 0,
      errors: [],
      summary: { support: 0, oppose: 0, conditional: 0, neutral: 0, mixed: 0 },
      details: [],
      dry_run,
    };

    for (const response of responses) {
      result.processed++;

      try {
        // Validate extraction status (defense in depth)
        if (response.extraction_status !== "ok") {
          console.log(`[analyze-remissvar-stance] Skipping ${response.id}: extraction_status=${response.extraction_status}`);
          result.skipped++;
          continue;
        }

        // Check for content
        if (!response.raw_content || response.raw_content.length < 100) {
          console.log(`[analyze-remissvar-stance] Skipping ${response.id}: insufficient content (${response.raw_content?.length || 0} chars)`);
          
          if (!dry_run) {
            await supabase
              .from("remiss_responses")
              .update({
                analysis_status: "skipped",
                analyzed_at: new Date().toISOString(),
                stance_signals: { skip_reason: "insufficient_content", char_count: response.raw_content?.length || 0 },
              })
              .eq("id", response.id);
          }
          
          result.skipped++;
          continue;
        }

        // Run stance analysis
        const analysis = analyzeStance(response.raw_content);

        // Update summary counts
        result.summary[analysis.summary]++;

        // Add to details
        result.details.push({
          response_id: response.id,
          responding_organization: response.responding_organization,
          stance_summary: analysis.summary,
          keywords_found: analysis.signals.keywords_found,
          word_count: analysis.signals.word_count,
          section_context: analysis.signals.section_context,
        });

        // Update database (unless dry run)
        if (!dry_run) {
          const { error: updateError } = await supabase
            .from("remiss_responses")
            .update({
              stance_summary: analysis.summary,
              stance_signals: analysis.signals,
              analysis_status: "ok",
              analyzed_at: new Date().toISOString(),
            })
            .eq("id", response.id);

          if (updateError) {
            throw new Error(`Database update failed: ${updateError.message}`);
          }
        }

        result.analyzed++;
        console.log(`[analyze-remissvar-stance] Analyzed ${response.id}: ${analysis.summary} (${analysis.signals.keywords_found.length} keywords)`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`[analyze-remissvar-stance] Error analyzing ${response.id}: ${errorMessage}`);
        
        result.errors.push({
          response_id: response.id,
          error: errorMessage,
        });

        // Mark as error in database (unless dry run)
        if (!dry_run) {
          await supabase
            .from("remiss_responses")
            .update({
              analysis_status: "error",
              analyzed_at: new Date().toISOString(),
              stance_signals: { error: errorMessage },
            })
            .eq("id", response.id);
        }
      }
    }

    console.log(`[analyze-remissvar-stance] Complete: analyzed=${result.analyzed}, skipped=${result.skipped}, errors=${result.errors.length}`);
    console.log(`[analyze-remissvar-stance] Stance distribution: support=${result.summary.support}, oppose=${result.summary.oppose}, conditional=${result.summary.conditional}, neutral=${result.summary.neutral}, mixed=${result.summary.mixed}`);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[analyze-remissvar-stance] Fatal error: ${errorMessage}`);
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
