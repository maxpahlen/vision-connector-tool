/**
 * Edge Function: link-remissvar-entities
 * Phase 2.7.9.3: Links remissvar to entities with confidence scoring
 * Fixed: Entity cache limit increased to 5000 (was defaulting to 1000)
 * 
 * Gate 5: Linking Correctness
 * - Clear "linked" vs "not linked" semantics
 * - Only writes entity_id when confidence >= threshold (high by default)
 * 
 * match_confidence persistence rules:
 * - High confidence + linked: persists 'high' with entity_id
 * - Medium/Low confidence (not linked): persists 'medium'/'low' for approval queue
 * - Unmatched: clears to null (no queue noise)
 * 
 * This allows EntityMatchApprovalQueue to query for medium/low matches pending review.
 * 
 * Input: { remiss_id?, limit?, create_entities?, dry_run?, min_confidence? }
 * Output: { processed, linked: { high }, not_linked: { medium, low, unmatched }, ... }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { 
  normalizeOrganizationName, 
  matchOrganization,
  clearEntityCache,
  type MatchConfidence 
} from '../_shared/organization-matcher.ts?v=2.7.9.6';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LinkRequest {
  remiss_id?: string;
  limit?: number;
  create_entities?: boolean;
  dry_run?: boolean;
  min_confidence?: MatchConfidence;
  reprocess_mode?: 'unlinked' | 'unmatched_and_rejected' | 'pending_review' | 'all';
  after_id?: string;      // Cursor for pagination
  force_relink?: boolean; // Override approval protection
}

interface LinkResult {
  processed: number;
  
  // Clear linked vs not-linked semantics
  linked: {
    high: number;
    total: number;
  };
  not_linked: {
    medium: number;
    low: number;
    unmatched: number;
    total: number;
  };
  
  // Legacy compatibility
  high_confidence: number;
  medium_confidence: number;
  low_confidence: number;
  unmatched: number;
  entities_created: number;
  
  // Enhanced tracking
  skipped_updates: number;
  
  errors: Array<{ response_id: string; error: string }>;
  review_needed: Array<{
    response_id: string;
    original_name: string;
    normalized_name: string;
    matched_name: string | null;
    similarity_score: number | null;
    confidence: MatchConfidence;
  }>;
  unmatched_orgs: string[];
  next_after_id: string | null;
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

    const body: LinkRequest = await req.json().catch(() => ({}));
    const { 
      remiss_id, 
      limit = 100, 
      create_entities = false, 
      dry_run = false,
      min_confidence = 'high',  // Default to HIGH only - correctness over recall
      reprocess_mode = 'unlinked',  // Default: only unlinked records
      after_id,         // Cursor for pagination
      force_relink = false  // Override approval protection
    } = body;

    console.log(`[link-remissvar-entities] Starting - remiss_id: ${remiss_id}, limit: ${limit}, create_entities: ${create_entities}, dry_run: ${dry_run}, min_confidence: ${min_confidence}, reprocess_mode: ${reprocess_mode}, after_id: ${after_id ?? 'none'}, force_relink: ${force_relink}`);

    // Clear entity cache at start of each run for fresh data
    clearEntityCache();

    // Fetch remiss_responses based on reprocess_mode
    let query = supabase
      .from('remiss_responses')
      .select('id, remiss_id, responding_organization, file_url, match_confidence, entity_id, metadata')
      .not('responding_organization', 'is', null);

    // PROTECTION: Never touch already-linked rows unless force_relink is true
    // This prevents fetching rows that would just be skipped in the loop
    if (!force_relink) {
      query = query.is('entity_id', null);
    }

    // Apply filtering based on reprocess_mode (on top of base protection)
    if (reprocess_mode === 'unlinked') {
      // Default: only truly virgin records (no entity_id, no confidence yet)
      query = query.is('match_confidence', null);
    } else if (reprocess_mode === 'pending_review') {
      // Phase 2.7.9: Reprocess items flagged for review (medium/low) plus unmatched
      // Allows re-matching after matcher improvements
      console.log('[linker] Mode: pending_review - including medium/low/unmatched');
      query = query.or('match_confidence.is.null,match_confidence.in.(medium,low,unmatched)');
    } else if (reprocess_mode === 'unmatched_and_rejected') {
      // Reprocess failed matches after matcher improvements
      // entity_id IS NULL already applied above, include rejected for re-matching
      query = query.or('match_confidence.is.null,match_confidence.eq.rejected');
    }
    // 'all' mode: all unlinked records (entity_id IS NULL already applied above)

    if (remiss_id) {
      query = query.eq('remiss_id', remiss_id);
    }

    // Cursor pagination for deterministic batching
    if (after_id) {
      query = query.gt('id', after_id);
    }

    // Stable ordering + limit
    const { data: responses, error: fetchError } = await query.order('id').limit(limit);

    if (fetchError) {
      console.error('[link-remissvar-entities] Fetch error:', fetchError);
      throw fetchError;
    }

    if (!responses || responses.length === 0) {
      return new Response(JSON.stringify({
        processed: 0,
        linked: { high: 0, total: 0 },
        not_linked: { medium: 0, low: 0, unmatched: 0, total: 0 },
        high_confidence: 0,
        medium_confidence: 0,
        low_confidence: 0,
        unmatched: 0,
        entities_created: 0,
        skipped_updates: 0,
        errors: [],
        review_needed: [],
        unmatched_orgs: [],
        message: 'No unlinked responses to process'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[link-remissvar-entities] Found ${responses.length} unlinked responses to process`);

    const result: LinkResult = {
      processed: 0,
      linked: { high: 0, total: 0 },
      not_linked: { medium: 0, low: 0, unmatched: 0, total: 0 },
      high_confidence: 0,
      medium_confidence: 0,
      low_confidence: 0,
      unmatched: 0,
      entities_created: 0,
      skipped_updates: 0,
      errors: [],
      review_needed: [],
      unmatched_orgs: [],
      next_after_id: null
    };

    // Track unique unmatched orgs
    const unmatchedOrgNames = new Map<string, number>();

    for (const response of responses) {
      try {
        // Track cursor for pagination
        result.next_after_id = response.id;
        
        // DEFENSE IN DEPTH: Skip already-linked rows (guard in case query filter missed them)
        if (response.entity_id && !force_relink) {
          console.log(`[link-remissvar-entities] Skipping already-linked: ${response.id}`);
          result.skipped_updates++;
          continue;
        }
        
        const normalizedName = normalizeOrganizationName(response.responding_organization);
        
        if (!normalizedName) {
          result.unmatched++;
          result.not_linked.unmatched++;
          result.not_linked.total++;
          continue;
        }

        // Try to match against existing entities
        const matchResult = await matchOrganization(supabase, normalizedName, 'organization');

        result.processed++;

        // Determine if we should link based on confidence threshold
        const confidenceOrder: MatchConfidence[] = ['high', 'medium', 'low', 'unmatched'];
        const minConfidenceIndex = confidenceOrder.indexOf(min_confidence);
        const matchConfidenceIndex = confidenceOrder.indexOf(matchResult.confidence);
        const shouldLink = matchResult.entity_id && matchConfidenceIndex <= minConfidenceIndex;

        // Track counts based on actual match result
        switch (matchResult.confidence) {
          case 'high':
            result.high_confidence++;
            if (shouldLink) {
              result.linked.high++;
              result.linked.total++;
            }
            break;
          case 'medium':
            result.medium_confidence++;
            result.not_linked.medium++;
            result.not_linked.total++;
            // Add to review queue
            result.review_needed.push({
              response_id: response.id,
              original_name: response.responding_organization,
              normalized_name: normalizedName,
              matched_name: matchResult.matched_name,
              similarity_score: matchResult.similarity_score,
              confidence: 'medium'
            });
            break;
          case 'low':
            result.low_confidence++;
            result.not_linked.low++;
            result.not_linked.total++;
            // Add to review queue
            result.review_needed.push({
              response_id: response.id,
              original_name: response.responding_organization,
              normalized_name: normalizedName,
              matched_name: matchResult.matched_name,
              similarity_score: matchResult.similarity_score,
              confidence: 'low'
            });
            break;
          case 'unmatched':
            result.unmatched++;
            result.not_linked.unmatched++;
            result.not_linked.total++;
            unmatchedOrgNames.set(normalizedName, (unmatchedOrgNames.get(normalizedName) || 0) + 1);
            break;
        }

        // GATE 5: Only persist when actually linking
        let entityId = shouldLink ? matchResult.entity_id : null;
        
        // Log when we skip a potential match due to low confidence
        if (matchResult.entity_id && !shouldLink) {
          console.log(`[link-remissvar-entities] NOT linking ${matchResult.confidence} match for "${normalizedName}" -> "${matchResult.matched_name}" (score: ${matchResult.similarity_score?.toFixed(2)})`);
        }

        // Create new entity if unmatched and create_entities is enabled
        if (!entityId && matchResult.confidence === 'unmatched' && create_entities && !dry_run) {
          const { data: newEntity, error: createError } = await supabase
            .from('entities')
            .insert({
              name: normalizedName,
              entity_type: 'organization',
              role: 'remissinstans',
              metadata: { 
                source: 'remissvar_auto_create',
                original_names: [response.responding_organization]
              }
            })
            .select('id')
            .single();

          if (createError) {
            console.error(`[link-remissvar-entities] Entity creation failed for "${normalizedName}":`, createError);
          } else if (newEntity) {
            entityId = newEntity.id;
            result.entities_created++;
            result.linked.total++;
            console.log(`[link-remissvar-entities] Created entity for "${normalizedName}"`);
          }
        }

        // GATE 5: Only update DB when we have something meaningful to persist
        // - If linking: write entity_id, match_confidence, normalized_org_name
        // - If NOT linking: only write normalized_org_name (for future matching)
        if (!dry_run) {
          if (entityId) {
            // Linked - write full match info
            const { error: updateError } = await supabase
              .from('remiss_responses')
              .update({
                entity_id: entityId,
                match_confidence: matchResult.confidence,
                normalized_org_name: normalizedName
              })
              .eq('id', response.id);

            if (updateError) {
              console.error(`[link-remissvar-entities] Update error for ${response.id}:`, updateError);
              result.errors.push({ response_id: response.id, error: updateError.message });
              result.skipped_updates++;
            }
          } else {
            // NOT linked - persist medium/low confidence for approval queue
            // Unmatched records clear match_confidence to null (no queue noise)
            const updateData: Record<string, unknown> = {
              entity_id: null,
              normalized_org_name: normalizedName
            };
            
            if (matchResult.confidence === 'medium' || matchResult.confidence === 'low') {
              updateData.match_confidence = matchResult.confidence;
              // Store backend suggestions in metadata for UI alignment
              // This avoids duplicate similarity calculation in EntityMatchApprovalQueue
              updateData.metadata = {
                ...((response as any).metadata || {}),
                suggested_entity_id: matchResult.entity_id,
                suggested_entity_name: matchResult.matched_name,
                similarity_score: matchResult.similarity_score
              };
              console.log(`[link-remissvar-entities] Persisting ${matchResult.confidence} confidence for review: "${normalizedName}" -> "${matchResult.matched_name}" (score: ${matchResult.similarity_score?.toFixed(2)})`);
            } else {
              // Persist explicit 'unmatched' for processed-but-no-match (observability)
              // Distinguishes from NULL which means "never processed"
              updateData.match_confidence = 'unmatched';
            }
            
            const { error: updateError } = await supabase
              .from('remiss_responses')
              .update(updateData)
              .eq('id', response.id);

            if (updateError) {
              console.error(`[link-remissvar-entities] Update error for ${response.id}:`, updateError);
              result.errors.push({ response_id: response.id, error: updateError.message });
              result.skipped_updates++;
            }
          }
        }

      } catch (err) {
        console.error(`[link-remissvar-entities] Error processing ${response.id}:`, err);
        result.errors.push({ 
          response_id: response.id, 
          error: err instanceof Error ? err.message : String(err) 
        });
      }
    }

    // Get top unmatched org names
    result.unmatched_orgs = [...unmatchedOrgNames.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => `${name} (${count})`);

    console.log(`[link-remissvar-entities] Complete - processed: ${result.processed}, linked: ${result.linked.total}, not_linked: ${result.not_linked.total}, created: ${result.entities_created}, skipped_updates: ${result.skipped_updates}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[link-remissvar-entities] Fatal error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
