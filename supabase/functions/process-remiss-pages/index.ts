/**
 * Phase 2.5: Process Remiss Pages Edge Function
 * 
 * Iterates over remiss_documents with status='discovered' and:
 * 1. Fetches each remiss_page_url
 * 2. Parses to extract deadline, remissinstanser PDF, remissvar links
 * 3. Updates remiss_documents with status='scraped' or 'failed'
 * 4. Populates remiss_responses table (idempotent via upsert)
 * 
 * Idempotency:
 * - Re-runs skip records with status IN ('scraped', 'failed') by default
 * - remiss_responses uses upsert with onConflict: 'remiss_id,file_url'
 * - force=true reprocesses failed records
 * 
 * Error Handling:
 * - Individual failures don't stop batch
 * - Failed records get status='failed' with error in metadata
 * - retry_failed=true processes status='failed' records
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseRemissPage, type RemissPageResult } from '../_shared/remiss-parser.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessResult {
  remiss_id: string;
  remiss_url: string;
  status: 'scraped' | 'failed' | 'skipped';
  remissvar_count?: number;
  error?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { 
      limit = 20, 
      remiss_id,
      retry_failed = false,
      dry_run = false 
    } = body;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Build query based on parameters
    let query = supabase
      .from('remiss_documents')
      .select('id, remiss_page_url, parent_document_id, title, metadata');

    if (remiss_id) {
      // Process specific remiss
      query = query.eq('id', remiss_id);
    } else if (retry_failed) {
      // Retry failed records
      query = query.eq('status', 'failed').limit(limit);
    } else {
      // Default: process discovered records
      query = query.eq('status', 'discovered').limit(limit);
    }

    const { data: remissDocs, error: fetchError } = await query;

    if (fetchError) throw fetchError;

    if (!remissDocs || remissDocs.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No remiss documents to process',
          summary: { total: 0, scraped: 0, failed: 0, skipped: 0 },
          results: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${remissDocs.length} remiss documents...`);

    const results: ProcessResult[] = [];
    let totalRemissvarInserted = 0;

    for (const remiss of remissDocs) {
      console.log(`\n--- Processing remiss: ${remiss.remiss_page_url} ---`);

      try {
        // Fetch the remiss page
        const response = await fetch(remiss.remiss_page_url, {
          headers: {
            'User-Agent': 'Vision-Connector-Tool/1.0 (Educational Research Tool)',
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} fetching remiss page`);
        }

        const html = await response.text();
        const parsed: RemissPageResult = parseRemissPage(html, remiss.remiss_page_url);

        console.log(`Extracted ${parsed.remissvar_documents.length} remissvar documents`);
        console.log(`Extraction log:`, parsed.extraction_log);

        if (dry_run) {
          results.push({
            remiss_id: remiss.id,
            remiss_url: remiss.remiss_page_url,
            status: 'scraped',
            remissvar_count: parsed.remissvar_documents.length,
          });
          continue;
        }

        // Update remiss_documents with extracted data
        const existingMetadata = (remiss.metadata as Record<string, unknown>) || {};
        const { error: updateError } = await supabase
          .from('remiss_documents')
          .update({
            title: parsed.remiss_title || remiss.title,
            remiss_deadline: parsed.remiss_deadline || null,
            remissinstanser_pdf_url: parsed.remissinstanser_pdf?.url || null,
            remissvar_count: parsed.remissvar_documents.length,
            status: 'scraped',
            updated_at: new Date().toISOString(),
            metadata: {
              ...existingMetadata,
              extraction_log: parsed.extraction_log,
              remissinstanser_filename: parsed.remissinstanser_pdf?.filename,
              scraped_at: new Date().toISOString(),
            },
          })
          .eq('id', remiss.id);

        if (updateError) {
          throw new Error(`Failed to update remiss_documents: ${updateError.message}`);
        }

        // Insert remissvar documents (idempotent via upsert)
        let insertedCount = 0;
        for (const rv of parsed.remissvar_documents) {
          const { error: rvError } = await supabase
            .from('remiss_responses')
            .upsert({
              remiss_id: remiss.id,
              file_url: rv.url,
              filename: rv.filename,
              responding_organization: rv.responding_organization,
              file_type: rv.file_type,
              status: rv.file_type === 'pdf' ? 'pending' : 'skipped_non_pdf',
              metadata: {
                title: rv.title,
              },
            }, {
              onConflict: 'remiss_id,file_url',
            });

          if (rvError) {
            console.error(`Error inserting remissvar: ${rvError.message}`);
          } else {
            insertedCount++;
          }
        }

        totalRemissvarInserted += insertedCount;

        results.push({
          remiss_id: remiss.id,
          remiss_url: remiss.remiss_page_url,
          status: 'scraped',
          remissvar_count: parsed.remissvar_documents.length,
        });

      } catch (err) {
        console.error(`Error processing remiss ${remiss.id}:`, err);

        if (!dry_run) {
          // Update status to failed with error in metadata
          const existingMetadata = (remiss.metadata as Record<string, unknown>) || {};
          await supabase
            .from('remiss_documents')
            .update({
              status: 'failed',
              updated_at: new Date().toISOString(),
              metadata: {
                ...existingMetadata,
                error: err instanceof Error ? err.message : String(err),
                failed_at: new Date().toISOString(),
              },
            })
            .eq('id', remiss.id);
        }

        results.push({
          remiss_id: remiss.id,
          remiss_url: remiss.remiss_page_url,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Summary
    const summary = {
      total: results.length,
      scraped: results.filter(r => r.status === 'scraped').length,
      failed: results.filter(r => r.status === 'failed').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      total_remissvar_inserted: totalRemissvarInserted,
      dry_run,
    };

    console.log('\n=== Summary ===');
    console.log(JSON.stringify(summary, null, 2));

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in process-remiss-pages:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'An error occurred',
        details: error instanceof Error ? error.stack : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
