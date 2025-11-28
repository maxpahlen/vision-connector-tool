import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, createErrorResponse, createSuccessResponse } from '../_shared/http-utils.ts';

interface SearchEntitiesRequest {
  query: string;
  entity_types?: string[]; // Filter by entity type
  limit?: number;
}

interface EntityResult {
  id: string;
  name: string;
  entity_type: string;
  role: string | null;
  document_count: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Extract and validate Authorization header
    const authHeader = req.headers.get('Authorization');
    console.log('[search-entities] auth header present:', Boolean(authHeader));

    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'UNAUTHORIZED', message: 'Authentication required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Create Supabase client with forwarded JWT
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { query, entity_types, limit = 10 }: SearchEntitiesRequest = await req.json();

    if (!query || query.trim().length === 0) {
      return createErrorResponse('INVALID_QUERY', 'Search query is required', 400);
    }

    const searchTerm = query.trim();
    const resultLimit = Math.min(limit, 20); // Max 20 results

    console.log('[search-entities] Search request:', { searchTerm, entity_types, limit: resultLimit });

    // Build query to find entities with document counts
    const searchPattern = `%${searchTerm}%`;
    
    // First, get matching entities
    let entitiesQuery = supabase
      .from('entities')
      .select('id, name, entity_type, role');

    // Apply name filter
    entitiesQuery = entitiesQuery.ilike('name', searchPattern);

    // Apply entity type filter if provided
    if (entity_types && entity_types.length > 0) {
      entitiesQuery = entitiesQuery.in('entity_type', entity_types);
    }

    entitiesQuery = entitiesQuery.limit(resultLimit * 2); // Get more initially, then rank

    const { data: entities, error: entitiesError } = await entitiesQuery;

    console.log('[search-entities] Entities found:', entities?.length);

    if (entitiesError) {
      console.error('[search-entities] Database error:', entitiesError);
      return createErrorResponse('DATABASE_ERROR', entitiesError.message, 500);
    }

    if (!entities || entities.length === 0) {
      return createSuccessResponse({ results: [] });
    }

    // Get document counts for these entities
    const entityIds = entities.map(e => e.id);
    
    const { data: relationCounts, error: relationsError } = await supabase
      .from('relations')
      .select('target_id, source_document_id')
      .in('target_id', entityIds)
      .eq('target_type', 'entity');

    if (relationsError) {
      console.error('[search-entities] Relations query error:', relationsError);
      // Continue without counts rather than failing
    }

    // Build document count map
    const documentCountMap = new Map<string, Set<string>>();
    if (relationCounts) {
      relationCounts.forEach(rel => {
        if (!documentCountMap.has(rel.target_id)) {
          documentCountMap.set(rel.target_id, new Set());
        }
        documentCountMap.get(rel.target_id)!.add(rel.source_document_id);
      });
    }

    // Build results with document counts
    const results: EntityResult[] = entities.map(entity => ({
      id: entity.id,
      name: entity.name,
      entity_type: entity.entity_type,
      role: entity.role,
      document_count: documentCountMap.get(entity.id)?.size || 0,
    }));

    // Sort by relevance: exact match first, then by document count, then alphabetically
    results.sort((a, b) => {
      // Exact match gets highest priority
      const aExact = a.name.toLowerCase() === searchTerm.toLowerCase() ? 1 : 0;
      const bExact = b.name.toLowerCase() === searchTerm.toLowerCase() ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;

      // Then by document count
      if (a.document_count !== b.document_count) {
        return b.document_count - a.document_count;
      }

      // Then alphabetically
      return a.name.localeCompare(b.name, 'sv');
    });

    // Return top N results
    const topResults = results.slice(0, resultLimit);

    console.log('[search-entities] Returning results:', topResults.length);

    return createSuccessResponse({
      results: topResults,
      total: topResults.length,
    });
  } catch (error) {
    console.error('[search-entities] Search error:', error);
    return createErrorResponse(
      'SEARCH_ERROR',
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
});
