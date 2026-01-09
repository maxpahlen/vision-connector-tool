/**
 * Edge Function: bootstrap-org-entities
 * Phase 2.7: Creates organization entities from remiss_invitees
 * 
 * Gate 2 & 3: Bootstrap Completeness & Entity Validation
 * - Uses PAGINATION to fetch all invitees (no 1000-row limit)
 * - Returns rich metrics for verification
 * - Tightened validation rules
 * 
 * Input: { limit?: number, dry_run?: boolean, min_occurrences?: number }
 * Output: { created, skipped_existing, skipped_invalid, total_candidates, unique_names, ... }
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
  min_occurrences?: number;
}

interface BootstrapResult {
  // Input metrics
  invitee_rows_fetched: number;
  unique_raw_names: number;
  unique_normalized_names: number;
  
  // Output metrics
  entities_created: number;
  entities_already_exist: number;
  
  // Validation breakdown
  invalid_rejected: number;
  rejected_too_short: number;
  rejected_too_long: number;
  rejected_contact_info: number;
  rejected_blocked_phrase: number;
  skipped_low_occurrence: number;
  
  // Legacy compatibility
  created: number;
  skipped_existing: number;
  skipped_invalid: number;
  total_candidates: number;
  dry_run: boolean;
  
  // Samples
  sample_created: string[];
  sample_skipped_invalid: string[];
}

/**
 * Paginated fetch of all remiss_invitees
 */
async function fetchAllInvitees(supabase: any): Promise<Array<{ organization_name: string }>> {
  const allInvitees: Array<{ organization_name: string }> = [];
  const pageSize = 1000;
  let offset = 0;
  
  while (true) {
    const { data, error } = await supabase
      .from('remiss_invitees')
      .select('organization_name')
      .is('entity_id', null)
      .range(offset, offset + pageSize - 1)
      .order('id');  // Deterministic ordering
    
    if (error) {
      console.error(`[bootstrap-org-entities] Fetch error at offset ${offset}:`, error);
      throw error;
    }
    
    if (!data || data.length === 0) {
      break;
    }
    
    allInvitees.push(...data);
    console.log(`[bootstrap-org-entities] Fetched ${allInvitees.length} invitees (page at offset ${offset})`);
    
    if (data.length < pageSize) {
      break; // Last page
    }
    
    offset += pageSize;
  }
  
  return allInvitees;
}

/**
 * Paginated fetch of all existing organization entities
 */
async function fetchExistingEntities(supabase: any): Promise<Set<string>> {
  const existingNames = new Set<string>();
  const pageSize = 1000;
  let offset = 0;
  
  while (true) {
    const { data, error } = await supabase
      .from('entities')
      .select('name')
      .eq('entity_type', 'organization')
      .range(offset, offset + pageSize - 1)
      .order('id');
    
    if (error) {
      console.error(`[bootstrap-org-entities] Fetch entities error at offset ${offset}:`, error);
      throw error;
    }
    
    if (!data || data.length === 0) {
      break;
    }
    
    for (const entity of data) {
      existingNames.add(entity.name.toLowerCase());
    }
    
    if (data.length < pageSize) {
      break;
    }
    
    offset += pageSize;
  }
  
  return existingNames;
}

/**
 * Validate candidate name and return rejection reason if invalid
 */
function validateCandidate(raw: string): { valid: boolean; reason?: string } {
  // Too short
  if (raw.length < 3) {
    return { valid: false, reason: 'too_short' };
  }
  
  // Too long (boilerplate paragraph)
  if (raw.length > 100) {
    return { valid: false, reason: 'too_long' };
  }
  
  // Contact info
  if (/@/.test(raw) || /www\./i.test(raw) || /https?:\/\//i.test(raw)) {
    return { valid: false, reason: 'contact_info' };
  }
  
  // Blocked phrase
  if (isBlockedPhrase(raw)) {
    return { valid: false, reason: 'blocked_phrase' };
  }
  
  return { valid: true };
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

    // GATE 2: Paginated fetch of ALL invitees (no truncation)
    const invitees = await fetchAllInvitees(supabase);
    
    if (invitees.length === 0) {
      return new Response(JSON.stringify({
        invitee_rows_fetched: 0,
        unique_raw_names: 0,
        unique_normalized_names: 0,
        entities_created: 0,
        entities_already_exist: 0,
        invalid_rejected: 0,
        rejected_too_short: 0,
        rejected_too_long: 0,
        rejected_contact_info: 0,
        rejected_blocked_phrase: 0,
        skipped_low_occurrence: 0,
        created: 0,
        skipped_existing: 0,
        skipped_invalid: 0,
        total_candidates: 0,
        dry_run,
        sample_created: [],
        sample_skipped_invalid: [],
        message: 'No unlinked invitees to process'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[bootstrap-org-entities] Fetched ${invitees.length} unlinked invitees (paginated)`);

    // Track unique raw names
    const rawNameSet = new Set<string>();
    for (const inv of invitees) {
      rawNameSet.add(inv.organization_name);
    }

    // GATE 3: Validate and normalize with detailed breakdown
    const occurrenceCounts = new Map<string, { count: number; original: string }>();
    const invalidNames: string[] = [];
    let rejectedTooShort = 0;
    let rejectedTooLong = 0;
    let rejectedContactInfo = 0;
    let rejectedBlockedPhrase = 0;

    for (const invitee of invitees) {
      // Validate first
      const validation = validateCandidate(invitee.organization_name);
      
      if (!validation.valid) {
        invalidNames.push(invitee.organization_name);
        switch (validation.reason) {
          case 'too_short': rejectedTooShort++; break;
          case 'too_long': rejectedTooLong++; break;
          case 'contact_info': rejectedContactInfo++; break;
          case 'blocked_phrase': rejectedBlockedPhrase++; break;
        }
        continue;
      }
      
      // Normalize
      const normalized = normalizeOrganizationName(invitee.organization_name);
      
      if (!normalized || normalized.length < 3) {
        invalidNames.push(invitee.organization_name);
        rejectedTooShort++;
        continue;
      }

      const existing = occurrenceCounts.get(normalized);
      if (existing) {
        existing.count++;
      } else {
        occurrenceCounts.set(normalized, { count: 1, original: invitee.organization_name });
      }
    }

    console.log(`[bootstrap-org-entities] ${occurrenceCounts.size} unique normalized names, ${invalidNames.length} invalid`);

    // GATE 2: Paginated fetch of existing entities
    const existingNames = await fetchExistingEntities(supabase);
    console.log(`[bootstrap-org-entities] ${existingNames.size} existing organization entities`);

    const result: BootstrapResult = {
      // Input metrics
      invitee_rows_fetched: invitees.length,
      unique_raw_names: rawNameSet.size,
      unique_normalized_names: occurrenceCounts.size,
      
      // Output metrics
      entities_created: 0,
      entities_already_exist: 0,
      
      // Validation breakdown
      invalid_rejected: invalidNames.length,
      rejected_too_short: rejectedTooShort,
      rejected_too_long: rejectedTooLong,
      rejected_contact_info: rejectedContactInfo,
      rejected_blocked_phrase: rejectedBlockedPhrase,
      skipped_low_occurrence: 0,
      
      // Legacy compatibility
      created: 0,
      skipped_existing: 0,
      skipped_invalid: invalidNames.length,
      total_candidates: invitees.length,
      dry_run,
      
      // Samples
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
        result.entities_already_exist++;
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

        result.entities_created += chunk.length;
        result.created += chunk.length;
        console.log(`[bootstrap-org-entities] Created ${result.entities_created}/${toCreate.length} entities`);
      }
    } else {
      result.entities_created = toCreate.length;
      result.created = toCreate.length;
    }

    console.log(`[bootstrap-org-entities] Complete - created: ${result.entities_created}, already_exist: ${result.entities_already_exist}, invalid: ${result.invalid_rejected}`);

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
