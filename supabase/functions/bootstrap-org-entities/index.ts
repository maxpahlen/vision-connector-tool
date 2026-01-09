/**
 * Edge Function: bootstrap-org-entities
 * Phase 2.7: Creates organization entities from remiss_invitees
 * 
 * Gate 2 & 3: Bootstrap Completeness & Entity Validation
 * - Uses PAGINATION to fetch all invitees (no 1000-row limit)
 * - Returns rich metrics for verification
 * - Tightened validation rules
 * - Case-insensitive deduplication (fixes duplicate entities)
 * - Allow/block list for short names
 * - Flagging for human review
 * 
 * Input: { limit?: number, dry_run?: boolean, min_occurrences?: number }
 * Output: { created, skipped_existing, skipped_invalid, flagged_for_review, ... }
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

interface FlaggedName {
  name: string;
  occurrences: number;
  reason: string;
  source_documents: string[];
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
  blocked_by_rule: number;
  skipped_low_occurrence: number;
  
  // Human review
  flagged_for_review: FlaggedName[];
  
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
 * Batch-load all name rules (allow/block) into memory
 * Performance optimization: single query instead of per-row lookups
 */
async function fetchNameRules(supabase: any): Promise<{
  allowSet: Set<string>;
  blockSet: Set<string>;
  blockReasons: Map<string, string>;
}> {
  const { data, error } = await supabase
    .from('entity_name_rules')
    .select('name_lower, rule_type, reason');
  
  if (error) {
    console.error('[bootstrap-org-entities] Failed to fetch name rules:', error);
    // Return empty sets - no rules means no blocking/allowing
    return { allowSet: new Set(), blockSet: new Set(), blockReasons: new Map() };
  }
  
  const allowSet = new Set<string>();
  const blockSet = new Set<string>();
  const blockReasons = new Map<string, string>();
  
  for (const rule of (data || [])) {
    if (rule.rule_type === 'allow') {
      allowSet.add(rule.name_lower);
    } else {
      blockSet.add(rule.name_lower);
      if (rule.reason) blockReasons.set(rule.name_lower, rule.reason);
    }
  }
  
  console.log(`[bootstrap-org-entities] Loaded ${allowSet.size} allow rules, ${blockSet.size} block rules`);
  return { allowSet, blockSet, blockReasons };
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

    // Batch-load allow/block rules at start (performance optimization)
    const { allowSet, blockSet, blockReasons } = await fetchNameRules(supabase);

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
        blocked_by_rule: 0,
        skipped_low_occurrence: 0,
        flagged_for_review: [],
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
    // FIX: Use lowercase key for deduplication, preserve display name for storage
    const occurrenceCounts = new Map<string, { count: number; original: string; displayName: string }>();
    const invalidNames: string[] = [];
    let rejectedTooShort = 0;
    let rejectedTooLong = 0;
    let rejectedContactInfo = 0;
    let rejectedBlockedPhrase = 0;
    let blockedByRule = 0;
    
    // Track flagged names for human review
    const flaggedForReview = new Map<string, FlaggedName>();

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

      // FIX: Use lowercase key for deduplication
      const dedupeKey = normalized.toLowerCase();
      
      // Check allow/block rules for short names (<=4 chars)
      if (normalized.length <= 4) {
        // Check block list first
        if (blockSet.has(dedupeKey)) {
          console.log(`[bootstrap-org-entities] Blocked by rule: "${normalized}" - ${blockReasons.get(dedupeKey) || 'no reason'}`);
          invalidNames.push(invitee.organization_name);
          blockedByRule++;
          continue;
        }
        
        // If not in allow list and not ALL CAPS, flag for review
        if (!allowSet.has(dedupeKey)) {
          const isAllCaps = /^[A-ZÅÄÖ0-9]+$/.test(normalized);
          if (!isAllCaps) {
            // Flag for human review
            const existing = flaggedForReview.get(dedupeKey);
            if (existing) {
              existing.occurrences++;
            } else {
              flaggedForReview.set(dedupeKey, {
                name: normalized,
                occurrences: 1,
                reason: 'Short mixed-case name (<=4 chars) - needs human review',
                source_documents: []
              });
            }
            // Still process it for now, just flag it
          }
        }
      }

      // FIX: Use dedupeKey for counting, preserve displayName for storage
      const existing = occurrenceCounts.get(dedupeKey);
      if (existing) {
        existing.count++;
      } else {
        occurrenceCounts.set(dedupeKey, { 
          count: 1, 
          original: invitee.organization_name,
          displayName: normalized  // Preserve original casing for display
        });
      }
    }

    console.log(`[bootstrap-org-entities] ${occurrenceCounts.size} unique normalized names, ${invalidNames.length} invalid, ${flaggedForReview.size} flagged for review`);

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
      blocked_by_rule: blockedByRule,
      skipped_low_occurrence: 0,
      
      // Human review
      flagged_for_review: Array.from(flaggedForReview.values()),
      
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

    for (const [dedupeKey, data] of occurrenceCounts) {
      // Skip if below occurrence threshold
      if (data.count < min_occurrences) {
        result.skipped_low_occurrence++;
        continue;
      }

      // FIX: Skip if already exists (case-insensitive check using dedupeKey)
      if (existingNames.has(dedupeKey)) {
        result.entities_already_exist++;
        result.skipped_existing++;
        continue;
      }

      // Add to creation list using preserved displayName
      entitiesToCreate.push({
        name: data.displayName,  // Use preserved casing for storage
        entity_type: 'organization',
        role: 'remissinstans',
        metadata: {
          source: 'bootstrap_from_invitees',
          occurrence_count: data.count,
          original_name: data.original
        }
      });

      if (result.sample_created.length < 10) {
        result.sample_created.push(`${data.displayName} (${data.count})`);
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

    console.log(`[bootstrap-org-entities] Complete - created: ${result.entities_created}, already_exist: ${result.entities_already_exist}, invalid: ${result.invalid_rejected}, blocked_by_rule: ${blockedByRule}, flagged: ${flaggedForReview.size}`);

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
