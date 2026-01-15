/**
 * Edge Function: link-invitee-entities
 * Phase 2.7.10: Links remiss_invitees to entities for "invited vs responded" analytics
 * 
 * Uses same matching logic as link-remissvar-entities for consistency.
 * 
 * Input: { remiss_id?, limit?, dry_run?, min_confidence?, reprocess_mode? }
 * Output: { processed, linked, not_linked, errors, review_needed, ... }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { 
  normalizeOrganizationName, 
  matchOrganization,
  clearEntityCache,
  type MatchConfidence 
} from '../_shared/organization-matcher.ts?v=2.7.10';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface LinkRequest {
  remiss_id?: string;
  limit?: number;
  dry_run?: boolean;
  min_confidence?: MatchConfidence;
  reprocess_mode?: 'unlinked' | 'pending_review' | 'all';
  after_id?: string;
}

interface LinkResult {
  processed: number;
  
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
  
  errors: Array<{ invitee_id: string; error: string }>;
  review_needed: Array<{
    invitee_id: string;
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
      limit = 500,  // Higher default since invitees are simpler
      dry_run = false,
      min_confidence = 'high',
      reprocess_mode = 'unlinked',
      after_id
    } = body;

    console.log(`[link-invitee-entities] Starting - remiss_id: ${remiss_id}, limit: ${limit}, dry_run: ${dry_run}, min_confidence: ${min_confidence}, reprocess_mode: ${reprocess_mode}, after_id: ${after_id ?? 'none'}`);

    // Clear entity cache at start
    clearEntityCache();

    // Build query for invitees
    let query = supabase
      .from('remiss_invitees')
      .select('id, remiss_id, organization_name, entity_id, metadata')
      .not('organization_name', 'is', null);

    // Filter based on reprocess_mode
    if (reprocess_mode === 'unlinked') {
      query = query.is('entity_id', null);
    } else if (reprocess_mode === 'pending_review') {
      // Include unlinked items that may have been processed before
      query = query.is('entity_id', null);
    }
    // 'all' mode: no filter on entity_id

    if (remiss_id) {
      query = query.eq('remiss_id', remiss_id);
    }

    // Cursor pagination
    if (after_id) {
      query = query.gt('id', after_id);
    }

    const { data: invitees, error: fetchError } = await query.order('id').limit(limit);

    if (fetchError) {
      console.error('[link-invitee-entities] Fetch error:', fetchError);
      throw fetchError;
    }

    if (!invitees || invitees.length === 0) {
      return new Response(JSON.stringify({
        processed: 0,
        linked: { high: 0, total: 0 },
        not_linked: { medium: 0, low: 0, unmatched: 0, total: 0 },
        high_confidence: 0,
        medium_confidence: 0,
        low_confidence: 0,
        unmatched: 0,
        errors: [],
        review_needed: [],
        unmatched_orgs: [],
        next_after_id: null,
        message: 'No unlinked invitees to process'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[link-invitee-entities] Found ${invitees.length} invitees to process`);

    const result: LinkResult = {
      processed: 0,
      linked: { high: 0, total: 0 },
      not_linked: { medium: 0, low: 0, unmatched: 0, total: 0 },
      high_confidence: 0,
      medium_confidence: 0,
      low_confidence: 0,
      unmatched: 0,
      errors: [],
      review_needed: [],
      unmatched_orgs: [],
      next_after_id: null
    };

    const unmatchedOrgNames = new Map<string, number>();

    for (const invitee of invitees) {
      try {
        result.next_after_id = invitee.id;

        // Skip already-linked
        if (invitee.entity_id && reprocess_mode !== 'all') {
          continue;
        }

        const normalizedName = normalizeOrganizationName(invitee.organization_name);
        
        if (!normalizedName) {
          result.unmatched++;
          result.not_linked.unmatched++;
          result.not_linked.total++;
          continue;
        }

        const matchResult = await matchOrganization(supabase, normalizedName, 'organization');
        result.processed++;

        // Determine linking threshold
        const confidenceOrder: MatchConfidence[] = ['high', 'medium', 'low', 'unmatched'];
        const minConfidenceIndex = confidenceOrder.indexOf(min_confidence);
        const matchConfidenceIndex = confidenceOrder.indexOf(matchResult.confidence);
        const shouldLink = matchResult.entity_id && matchConfidenceIndex <= minConfidenceIndex;

        // Track counts
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
            result.review_needed.push({
              invitee_id: invitee.id,
              original_name: invitee.organization_name,
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
            result.review_needed.push({
              invitee_id: invitee.id,
              original_name: invitee.organization_name,
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

        // Update database
        if (!dry_run && shouldLink && matchResult.entity_id) {
          const { error: updateError } = await supabase
            .from('remiss_invitees')
            .update({
              entity_id: matchResult.entity_id,
              metadata: {
                ...(invitee.metadata || {}),
                match_confidence: matchResult.confidence,
                matched_name: matchResult.matched_name,
                similarity_score: matchResult.similarity_score,
                linked_at: new Date().toISOString()
              }
            })
            .eq('id', invitee.id);

          if (updateError) {
            console.error(`[link-invitee-entities] Update error for ${invitee.id}:`, updateError);
            result.errors.push({ invitee_id: invitee.id, error: updateError.message });
          }
        } else if (!dry_run && !shouldLink) {
          // Store match suggestion in metadata for future review
          const { error: updateError } = await supabase
            .from('remiss_invitees')
            .update({
              metadata: {
                ...(invitee.metadata || {}),
                match_confidence: matchResult.confidence,
                suggested_entity_id: matchResult.entity_id,
                suggested_entity_name: matchResult.matched_name,
                similarity_score: matchResult.similarity_score,
                processed_at: new Date().toISOString()
              }
            })
            .eq('id', invitee.id);

          if (updateError) {
            console.error(`[link-invitee-entities] Metadata update error for ${invitee.id}:`, updateError);
          }
        }

      } catch (err) {
        console.error(`[link-invitee-entities] Error processing ${invitee.id}:`, err);
        result.errors.push({ 
          invitee_id: invitee.id, 
          error: err instanceof Error ? err.message : String(err) 
        });
      }
    }

    // Top unmatched org names
    result.unmatched_orgs = [...unmatchedOrgNames.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => `${name} (${count})`);

    console.log(`[link-invitee-entities] Complete - processed: ${result.processed}, linked: ${result.linked.total}, not_linked: ${result.not_linked.total}, errors: ${result.errors.length}`);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[link-invitee-entities] Fatal error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
