/**
 * Edge Function: process-remissinstanser
 * Phase 2.7: Parses remissinstanser PDFs to extract invited organizations
 * 
 * Gate 1: Parser Correctness
 * - Uses whitelist numbered-pattern extraction
 * - Captures diagnostic metadata for all PDFs (including failed)
 * - No silent skips - all documents get processed status
 * 
 * Input: { remiss_id?: string, limit?: number, dry_run?: boolean }
 * Output: { processed, invitees_extracted, errors, details, skipped_details }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { 
  parseRemissinstanserTextWithDiagnostics,
  type ParseStatus
} from '../_shared/organization-matcher.ts';
import {
  getPdfExtractorConfig,
  extractTextFromPdf,
} from '../_shared/pdf-extractor.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessRequest {
  remiss_id?: string;
  limit?: number;
  dry_run?: boolean;
}

interface ProcessResult {
  processed: number;
  invitees_extracted: number;
  skipped: number;
  errors: Array<{ remiss_id: string; error: string }>;
  details: Array<{
    remiss_id: string;
    title: string;
    invitees_count: number;
    sample_invitees: string[];
    parse_status: ParseStatus;
  }>;
  skipped_details: Array<{
    remiss_id: string;
    title: string;
    parse_status: ParseStatus;
    parse_reason: string;
    sample_lines: string[];
  }>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body: ProcessRequest = await req.json().catch(() => ({}));
    const { remiss_id, limit = 10, dry_run = false } = body;

    console.log(`[process-remissinstanser] Starting - remiss_id: ${remiss_id}, limit: ${limit}, dry_run: ${dry_run}`);

    // Fetch remiss_documents with remissinstanser_pdf_url
    let query = supabase
      .from('remiss_documents')
      .select('id, title, remissinstanser_pdf_url, metadata')
      .not('remissinstanser_pdf_url', 'is', null);

    if (remiss_id) {
      query = query.eq('id', remiss_id);
    } else {
      // Skip already processed (where metadata has invitees_processed = true)
      query = query.or('metadata->invitees_processed.is.null,metadata->invitees_processed.eq.false');
    }

    const { data: remisser, error: fetchError } = await query.limit(limit);

    if (fetchError) {
      console.error('[process-remissinstanser] Fetch error:', fetchError);
      throw fetchError;
    }

    if (!remisser || remisser.length === 0) {
      return new Response(JSON.stringify({
        processed: 0,
        invitees_extracted: 0,
        skipped: 0,
        errors: [],
        details: [],
        skipped_details: [],
        message: 'No remisser to process'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[process-remissinstanser] Found ${remisser.length} remisser to process`);

    // Get PDF extractor config using shared utility
    const pdfConfig = getPdfExtractorConfig();

    const result: ProcessResult = {
      processed: 0,
      invitees_extracted: 0,
      skipped: 0,
      errors: [],
      details: [],
      skipped_details: []
    };

    for (const remiss of remisser) {
      try {
        console.log(`[process-remissinstanser] Processing remiss ${remiss.id}: ${remiss.title}`);

        // Extract text from PDF using shared utility
        const extractionResult = await extractTextFromPdf(pdfConfig, remiss.remissinstanser_pdf_url);

        if (!extractionResult.success) {
          console.error(`[process-remissinstanser] PDF extraction failed for ${remiss.id}: ${extractionResult.message}`);
          
          // Still mark as processed but with failure metadata
          if (!dry_run) {
            await supabase
              .from('remiss_documents')
              .update({ 
                metadata: { 
                  ...remiss.metadata, 
                  invitees_processed: true,
                  invitees_count: 0,
                  parse_status: 'extraction_failed',
                  parse_reason: extractionResult.message || 'PDF extraction failed',
                  parse_sample_lines: [],
                  processed_at: new Date().toISOString()
                } 
              })
              .eq('id', remiss.id);
          }
          
          result.errors.push({ remiss_id: remiss.id, error: extractionResult.message || 'PDF extraction failed' });
          continue;
        }

        const pdfText = extractionResult.text || '';

        if (!pdfText) {
          console.warn(`[process-remissinstanser] No text extracted from PDF for ${remiss.id}`);
          
          if (!dry_run) {
            await supabase
              .from('remiss_documents')
              .update({ 
                metadata: { 
                  ...remiss.metadata, 
                  invitees_processed: true,
                  invitees_count: 0,
                  parse_status: 'extraction_failed',
                  parse_reason: 'No text extracted from PDF',
                  parse_sample_lines: [],
                  processed_at: new Date().toISOString()
                } 
              })
              .eq('id', remiss.id);
          }
          
          result.errors.push({ remiss_id: remiss.id, error: 'No text extracted from PDF' });
          continue;
        }

        // Parse organizations from PDF text using numbered pattern (whitelist approach)
        const parseResult = parseRemissinstanserTextWithDiagnostics(pdfText);
        const organizations = parseResult.organizations;
        
        console.log(`[process-remissinstanser] Parse result for ${remiss.id}: status=${parseResult.status}, orgs=${organizations.length}, numbered_lines=${parseResult.numbered_lines_found}`);

        // Handle case where no organizations were found (but extraction succeeded)
        if (organizations.length === 0) {
          console.warn(`[process-remissinstanser] No organizations found in ${remiss.id}: ${parseResult.reason}`);
          
          if (!dry_run) {
            await supabase
              .from('remiss_documents')
              .update({ 
                metadata: { 
                  ...remiss.metadata, 
                  invitees_processed: true,
                  invitees_count: 0,
                  parse_status: parseResult.status,
                  parse_reason: parseResult.reason,
                  parse_sample_lines: parseResult.sample_lines.slice(0, 20),
                  numbered_lines_found: parseResult.numbered_lines_found,
                  total_lines: parseResult.total_lines,
                  processed_at: new Date().toISOString()
                } 
              })
              .eq('id', remiss.id);
          }
          
          result.skipped++;
          result.skipped_details.push({
            remiss_id: remiss.id,
            title: remiss.title || 'Untitled',
            parse_status: parseResult.status,
            parse_reason: parseResult.reason,
            sample_lines: parseResult.sample_lines.slice(0, 10)
          });
          continue;
        }

        if (!dry_run && organizations.length > 0) {
          // Insert invitees (upsert to handle duplicates)
          const invitees = organizations.map(org => ({
            remiss_id: remiss.id,
            organization_name: org,
            metadata: { source: 'pdf_extraction' }
          }));

          const { error: insertError } = await supabase
            .from('remiss_invitees')
            .upsert(invitees, { 
              onConflict: 'remiss_id,organization_name',
              ignoreDuplicates: true 
            });

          if (insertError) {
            console.error(`[process-remissinstanser] Insert error for ${remiss.id}:`, insertError);
            result.errors.push({ remiss_id: remiss.id, error: `Insert failed: ${insertError.message}` });
            continue;
          }

          // Update remiss metadata to mark as processed with full diagnostics
          await supabase
            .from('remiss_documents')
            .update({ 
              metadata: { 
                ...remiss.metadata, 
                invitees_processed: true,
                invitees_count: organizations.length,
                parse_status: parseResult.status,
                parse_reason: parseResult.reason,
                numbered_lines_found: parseResult.numbered_lines_found,
                total_lines: parseResult.total_lines,
                processed_at: new Date().toISOString()
              } 
            })
            .eq('id', remiss.id);
        }

        result.processed++;
        result.invitees_extracted += organizations.length;
        result.details.push({
          remiss_id: remiss.id,
          title: remiss.title || 'Untitled',
          invitees_count: organizations.length,
          sample_invitees: organizations.slice(0, 5),
          parse_status: parseResult.status
        });

      } catch (err) {
        console.error(`[process-remissinstanser] Error processing ${remiss.id}:`, err);
        result.errors.push({ 
          remiss_id: remiss.id, 
          error: err instanceof Error ? err.message : String(err) 
        });
      }
    }

    console.log(`[process-remissinstanser] Complete - processed: ${result.processed}, invitees: ${result.invitees_extracted}, skipped: ${result.skipped}, errors: ${result.errors.length}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[process-remissinstanser] Fatal error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
