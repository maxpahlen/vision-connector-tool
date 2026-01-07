/**
 * Edge Function: link-remissvar-entities
 * Phase 2.7: Links remissvar to entities with confidence scoring
 * 
 * Input: { remiss_id?: string, limit?: number, create_entities?: boolean, dry_run?: boolean }
 * Output: { processed, high_confidence, medium_confidence, low_confidence, unmatched, entities_created }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { 
  normalizeOrganizationName, 
  matchOrganization,
  type MatchConfidence 
} from '../_shared/organization-matcher.ts';

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
}

interface LinkResult {
  processed: number;
  high_confidence: number;
  medium_confidence: number;
  low_confidence: number;
  unmatched: number;
  entities_created: number;
  errors: Array<{ response_id: string; error: string }>;
  low_confidence_matches: Array<{
    response_id: string;
    original_name: string;
    normalized_name: string;
    matched_name: string | null;
    similarity_score: number | null;
  }>;
  unmatched_orgs: string[];
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
      min_confidence = 'low'
    } = body;

    console.log(`[link-remissvar-entities] Starting - remiss_id: ${remiss_id}, limit: ${limit}, create_entities: ${create_entities}, dry_run: ${dry_run}`);

    // Fetch unlinked remiss_responses
    let query = supabase
      .from('remiss_responses')
      .select('id, remiss_id, responding_organization, file_url')
      .is('entity_id', null)
      .not('responding_organization', 'is', null);

    if (remiss_id) {
      query = query.eq('remiss_id', remiss_id);
    }

    const { data: responses, error: fetchError } = await query.limit(limit);

    if (fetchError) {
      console.error('[link-remissvar-entities] Fetch error:', fetchError);
      throw fetchError;
    }

    if (!responses || responses.length === 0) {
      return new Response(JSON.stringify({
        processed: 0,
        high_confidence: 0,
        medium_confidence: 0,
        low_confidence: 0,
        unmatched: 0,
        entities_created: 0,
        errors: [],
        low_confidence_matches: [],
        unmatched_orgs: [],
        message: 'No unlinked responses to process'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`[link-remissvar-entities] Found ${responses.length} unlinked responses to process`);

    const result: LinkResult = {
      processed: 0,
      high_confidence: 0,
      medium_confidence: 0,
      low_confidence: 0,
      unmatched: 0,
      entities_created: 0,
      errors: [],
      low_confidence_matches: [],
      unmatched_orgs: []
    };

    // Track unique unmatched orgs for potential entity creation
    const unmatchedOrgNames = new Map<string, number>();

    for (const response of responses) {
      try {
        const normalizedName = normalizeOrganizationName(response.responding_organization);
        
        if (!normalizedName) {
          result.unmatched++;
          continue;
        }

        // Try to match against existing entities
        const matchResult = await matchOrganization(supabase, normalizedName, 'organization');

        result.processed++;

        // Track confidence counts
        switch (matchResult.confidence) {
          case 'high':
            result.high_confidence++;
            break;
          case 'medium':
            result.medium_confidence++;
            break;
          case 'low':
            result.low_confidence++;
            result.low_confidence_matches.push({
              response_id: response.id,
              original_name: response.responding_organization,
              normalized_name: normalizedName,
              matched_name: matchResult.matched_name,
              similarity_score: matchResult.similarity_score
            });
            break;
          case 'unmatched':
            result.unmatched++;
            unmatchedOrgNames.set(normalizedName, (unmatchedOrgNames.get(normalizedName) || 0) + 1);
            break;
        }

        // Determine if we should use this match
        const confidenceOrder: MatchConfidence[] = ['high', 'medium', 'low', 'unmatched'];
        const minConfidenceIndex = confidenceOrder.indexOf(min_confidence);
        const matchConfidenceIndex = confidenceOrder.indexOf(matchResult.confidence);
        const shouldUseMatch = matchResult.entity_id && matchConfidenceIndex <= minConfidenceIndex;

        let entityId = shouldUseMatch ? matchResult.entity_id : null;

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
            console.log(`[link-remissvar-entities] Created entity for "${normalizedName}"`);
          }
        }

        // Update remiss_response with entity link
        if (!dry_run && (entityId || normalizedName)) {
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

    console.log(`[link-remissvar-entities] Complete - processed: ${result.processed}, high: ${result.high_confidence}, medium: ${result.medium_confidence}, low: ${result.low_confidence}, unmatched: ${result.unmatched}, created: ${result.entities_created}`);

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
