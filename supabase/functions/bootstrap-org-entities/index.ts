/**
 * Edge Function: bootstrap-org-entities
 * Phase 2.7: Creates organization entities from remiss_invitees
 * 
 * This seeds the entities table with organizations extracted from remissinstanser PDFs,
 * enabling the link-remissvar-entities function to match responses to entities.
 * 
 * Input: { limit?: number, dry_run?: boolean, min_occurrences?: number }
 * Output: { created, skipped_existing, skipped_invalid, total_candidates }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { 
  normalizeOrganizationName,
  isDocumentTitle,
  isBlockedPhrase
} from '../_shared/organization-matcher.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BootstrapRequest {
  limit?: number;
  dry_run?: boolean;
  min_occurrences?: number;  // Only create entities that appear N+ times
}

interface BootstrapResult {
  created: number;
  skipped_existing: number;
  skipped_invalid: number;
  skipped_low_occurrence: number;
  total_candidates: number;
  dry_run: boolean;
  sample_created: string[];
  sample_skipped_invalid: string[];
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

    const body: BootstrapRequest = await req.json().catch(() => ({}));
    const { 
      limit = 500, 
      dry_run = false,
      min_occurrences = 1
    } = body;

    console.log(`[bootstrap-org-entities] Starting - limit: ${limit}, dry_run: ${dry_run}, min_occurrences: ${min_occurrences}`);

    // Fetch ALL invitee organization names (bypass 1000-row default limit)
    const { data: invitees, error: fetchError } = await supabase
      .from('remiss_invitees')
      .select('organization_name')
      .is('entity_id', null)  // Only unlinked invitees
      .range(0, 9999);        // Fetch up to 10,000 rows

    if (fetchError) {
      console.error('[bootstrap-org-entities] Fetch error:', fetchError);
      throw fetchError;
    }

    if (!invitees || invitees.length === 0) {
      return new Response(JSON.stringify({
        created: 0,
        skipped_existing: 0,
        skipped_invalid: 0,
        skipped_low_occurrence: 0,
        total_candidates: 0,
        dry_run,
        sample_created: [],
        sample_skipped_invalid: [],
        message: 'No unlinked invitees to process'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[bootstrap-org-entities] Found ${invitees.length} unlinked invitees`);

    // Count occurrences of normalized names
    const occurrenceCounts = new Map<string, { count: number; original: string }>();
    const invalidNames: string[] = [];

    for (const invitee of invitees) {
      // Apply blocked phrase filter FIRST (before normalization)
      if (isBlockedPhrase(invitee.organization_name)) {
        invalidNames.push(invitee.organization_name);
        continue;
      }
      
      const normalized = normalizeOrganizationName(invitee.organization_name);
      
      if (!normalized || normalized.length < 3) {
        invalidNames.push(invitee.organization_name);
        continue;
      }

      const existing = occurrenceCounts.get(normalized);
      if (existing) {
        existing.count++;
      } else {
        occurrenceCounts.set(normalized, { count: 1, original: invitee.organization_name });
      }
    }

    console.log(`[bootstrap-org-entities] ${occurrenceCounts.size} unique valid names, ${invalidNames.length} invalid`);

    // Get existing entities to avoid duplicates (bypass 1000-row limit)
    const { data: existingEntities } = await supabase
      .from('entities')
      .select('name')
      .eq('entity_type', 'organization')
      .range(0, 9999);

    const existingNames = new Set(
      (existingEntities || []).map(e => e.name.toLowerCase())
    );

    console.log(`[bootstrap-org-entities] ${existingNames.size} existing organization entities`);

    const result: BootstrapResult = {
      created: 0,
      skipped_existing: 0,
      skipped_invalid: invalidNames.length,
      skipped_low_occurrence: 0,
      total_candidates: invitees.length,
      dry_run,
      sample_created: [],
      sample_skipped_invalid: invalidNames.slice(0, 10)
    };

    // Process candidates
    const entitiesToCreate: Array<{
      name: string;
      entity_type: string;
      role: string;
      metadata: Record<string, unknown>;
    }> = [];

    for (const [normalized, data] of occurrenceCounts) {
      // Skip if below occurrence threshold
      if (data.count < min_occurrences) {
        result.skipped_low_occurrence++;
        continue;
      }

      // Skip if already exists
      if (existingNames.has(normalized.toLowerCase())) {
        result.skipped_existing++;
        continue;
      }

      // Add to creation list
      entitiesToCreate.push({
        name: normalized,
        entity_type: 'organization',
        role: 'remissinstans',
        metadata: {
          source: 'bootstrap_from_invitees',
          occurrence_count: data.count,
          original_name: data.original
        }
      });

      if (result.sample_created.length < 10) {
        result.sample_created.push(`${normalized} (${data.count})`);
      }
    }

    console.log(`[bootstrap-org-entities] ${entitiesToCreate.length} entities to create`);

    // Apply limit
    const toCreate = entitiesToCreate.slice(0, limit);

    if (!dry_run && toCreate.length > 0) {
      // Batch insert in chunks of 100
      const chunkSize = 100;
      for (let i = 0; i < toCreate.length; i += chunkSize) {
        const chunk = toCreate.slice(i, i + chunkSize);
        const { error: insertError } = await supabase
          .from('entities')
          .insert(chunk);

        if (insertError) {
          console.error(`[bootstrap-org-entities] Insert error at chunk ${i}:`, insertError);
          throw insertError;
        }

        result.created += chunk.length;
        console.log(`[bootstrap-org-entities] Created ${result.created}/${toCreate.length} entities`);
      }
    } else {
      result.created = toCreate.length;  // In dry_run, report what would be created
    }

    console.log(`[bootstrap-org-entities] Complete - created: ${result.created}, skipped_existing: ${result.skipped_existing}, skipped_invalid: ${result.skipped_invalid}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[bootstrap-org-entities] Fatal error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
