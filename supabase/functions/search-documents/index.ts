import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, createErrorResponse, createSuccessResponse } from '../_shared/http-utils.ts';

interface SearchFilters {
  doc_types?: string[];
  ministries?: string[];
  stages?: string[];
  date_from?: string;
  date_to?: string;
}

interface SearchRequest {
  query: string;
  filters?: SearchFilters;
  pagination?: {
    page?: number;
    per_page?: number;
  };
  options?: {
    include_highlights?: boolean;
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const {
      query,
      filters = {},
      pagination = {},
      options = {},
    }: SearchRequest = await req.json();

    if (!query || query.trim().length === 0) {
      return createErrorResponse('INVALID_QUERY', 'Search query is required', 400);
    }

    const page = pagination.page || 1;
    const perPage = Math.min(pagination.per_page || 20, 100);
    const offset = (page - 1) * perPage;
    const includeHighlights = options.include_highlights !== false;

    console.log('Search request:', { query, filters, page, perPage });

    // Build base query - use rpc or direct filter instead of textSearch
    const searchTerm = query.trim();
    
    // Build the query with filters
    let baseQuery = supabase
      .from('documents')
      .select(`
        id,
        doc_type,
        doc_number,
        title,
        ministry,
        publication_date,
        raw_content,
        process_documents(
          process_id,
          processes(
            current_stage
          )
        )
      `, { count: 'exact' });

    // Apply doc_type filter
    if (filters.doc_types && filters.doc_types.length > 0) {
      baseQuery = baseQuery.in('doc_type', filters.doc_types);
    }

    // Apply ministry filter
    if (filters.ministries && filters.ministries.length > 0) {
      baseQuery = baseQuery.in('ministry', filters.ministries);
    }

    // Apply date range filters
    if (filters.date_from) {
      baseQuery = baseQuery.gte('publication_date', filters.date_from);
    }
    if (filters.date_to) {
      baseQuery = baseQuery.lte('publication_date', filters.date_to);
    }

    // For full-text search, we need to use a custom RPC or filter
    // Let's use a simple ILIKE search for now as a fallback
    const searchPattern = `%${searchTerm}%`;
    baseQuery = baseQuery.or(`title.ilike.${searchPattern},doc_number.ilike.${searchPattern},raw_content.ilike.${searchPattern}`);

    console.log('Executing query with search pattern:', searchPattern);

    // Execute query with pagination
    const { data: documents, error, count } = await baseQuery
      .order('publication_date', { ascending: false })
      .range(offset, offset + perPage - 1);

    console.log('Query results:', { count, documentCount: documents?.length, hasError: !!error });

    if (error) {
      console.error('Database error:', error);
      return createErrorResponse('DATABASE_ERROR', error.message, 500);
    }

    // Filter by stage if needed (in-memory)
    let filteredDocuments = documents || [];
    if (filters.stages && filters.stages.length > 0) {
      filteredDocuments = filteredDocuments.filter(doc => {
        const processStages = doc.process_documents?.map((pd: any) => pd.processes?.current_stage).filter(Boolean) || [];
        return processStages.some(stage => filters.stages!.includes(stage));
      });
    }

    // Generate highlights using ts_headline
    const results = await Promise.all(
      filteredDocuments.map(async (doc: any) => {
        let highlights: string[] = [];

        if (includeHighlights && doc.raw_content) {
          // Simple excerpt highlighting (ts_headline RPC not available)
          const content = doc.raw_content.substring(0, 5000);
          const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
          
          // Find first occurrence of any search term
          let excerptStart = 0;
          for (const term of searchTerms) {
            const pos = content.toLowerCase().indexOf(term);
            if (pos !== -1) {
              excerptStart = Math.max(0, pos - 100);
              break;
            }
          }
          
          const excerpt = content.substring(excerptStart, excerptStart + 300);
          const displayExcerpt = (excerptStart > 0 ? '...' : '') + excerpt + '...';
          highlights.push(displayExcerpt);
        }

        // Get the stage from the first process (documents can be in multiple processes)
        const stage = doc.process_documents?.[0]?.processes?.current_stage || null;

        return {
          id: doc.id,
          doc_type: doc.doc_type,
          doc_number: doc.doc_number,
          title: doc.title,
          ministry: doc.ministry,
          publication_date: doc.publication_date,
          stage,
          highlights: highlights.length > 0 ? highlights : undefined,
        };
      })
    );

    const totalPages = Math.ceil((count || 0) / perPage);

    return createSuccessResponse({
      results,
      pagination: {
        page,
        per_page: perPage,
        total: count || 0,
        total_pages: totalPages,
      },
    });
  } catch (error) {
    console.error('Search error:', error);
    return createErrorResponse(
      'SEARCH_ERROR',
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
});
