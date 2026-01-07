/**
 * Edge Function: process-remissinstanser
 * Phase 2.7: Parses remissinstanser PDFs to extract invited organizations
 * 
 * Input: { remiss_id?: string, limit?: number, dry_run?: boolean }
 * Output: { processed: number, invitees_extracted: number, errors: [] }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { 
  normalizeOrganizationName, 
  parseRemissinstanserText 
} from '../_shared/organization-matcher.ts';

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
        message: 'No remisser to process'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[process-remissinstanser] Found ${remisser.length} remisser to process`);

    const pdfExtractorUrl = Deno.env.get('PDF_EXTRACTOR_URL');
    const pdfExtractorApiKey = Deno.env.get('PDF_EXTRACTOR_API_KEY');

    if (!pdfExtractorUrl || !pdfExtractorApiKey) {
      throw new Error('PDF_EXTRACTOR_URL or PDF_EXTRACTOR_API_KEY not configured');
    }

    const result: ProcessResult = {
      processed: 0,
      invitees_extracted: 0,
      skipped: 0,
      errors: [],
      details: []
    };

    for (const remiss of remisser) {
      try {
        console.log(`[process-remissinstanser] Processing remiss ${remiss.id}: ${remiss.title}`);

        // Extract text from PDF
        const extractResponse = await fetch(pdfExtractorUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${pdfExtractorApiKey}`
          },
          body: JSON.stringify({ pdfUrl: remiss.remissinstanser_pdf_url })
        });

        if (!extractResponse.ok) {
          const errorText = await extractResponse.text();
          console.error(`[process-remissinstanser] PDF extraction failed for ${remiss.id}: ${errorText}`);
          result.errors.push({ remiss_id: remiss.id, error: `PDF extraction failed: ${extractResponse.status}` });
          continue;
        }

        const extractResult = await extractResponse.json();
        const pdfText = extractResult.text || '';

        if (!pdfText) {
          console.warn(`[process-remissinstanser] No text extracted from PDF for ${remiss.id}`);
          result.errors.push({ remiss_id: remiss.id, error: 'No text extracted from PDF' });
          continue;
        }

        // Parse organizations from PDF text
        const organizations = parseRemissinstanserText(pdfText);
        console.log(`[process-remissinstanser] Extracted ${organizations.length} organizations from ${remiss.id}`);

        if (organizations.length === 0) {
          // Try simpler line-by-line parsing as fallback
          const lines = pdfText.split('\n')
            .map((l: string) => l.trim())
            .filter((l: string) => l.length > 3 && l.length < 150 && /^[A-ZÅÄÖ]/.test(l));
          
          if (lines.length > 0) {
            organizations.push(...lines.slice(0, 100).map(normalizeOrganizationName));
          }
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

          // Update remiss metadata to mark as processed
          await supabase
            .from('remiss_documents')
            .update({ 
              metadata: { 
                ...remiss.metadata, 
                invitees_processed: true,
                invitees_count: organizations.length,
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
          sample_invitees: organizations.slice(0, 5)
        });

      } catch (err) {
        console.error(`[process-remissinstanser] Error processing ${remiss.id}:`, err);
        result.errors.push({ 
          remiss_id: remiss.id, 
          error: err instanceof Error ? err.message : String(err) 
        });
      }
    }

    console.log(`[process-remissinstanser] Complete - processed: ${result.processed}, invitees: ${result.invitees_extracted}, errors: ${result.errors.length}`);

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
