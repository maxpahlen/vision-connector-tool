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

    const searchTerm = query.trim();
    
    // Build the query - get documents without joins first
    let baseQuery = supabase
      .from('documents')
      .select('id, doc_type, doc_number, title, ministry, publication_date, raw_content', { count: 'exact' });

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

    // Apply text search using ILIKE on title and doc_number
    const searchPattern = `%${searchTerm}%`;
    baseQuery = baseQuery.or(`title.ilike.${searchPattern},doc_number.ilike.${searchPattern}`);

    console.log('Executing query with search:', searchTerm);

    // Execute query with pagination
    const { data: documents, error, count } = await baseQuery
      .order('publication_date', { ascending: false })
      .range(offset, offset + perPage - 1);

    console.log('Query results:', { count, documentCount: documents?.length, hasError: !!error });

    if (error) {
      console.error('Database error:', error);
      return createErrorResponse('DATABASE_ERROR', error.message, 500);
    }

    // Get process info for each document separately
    const documentIds = documents?.map(d => d.id) || [];
    let processData: any[] = [];
    
    if (documentIds.length > 0) {
      const { data } = await supabase
        .from('process_documents')
        .select('document_id, processes(current_stage)')
        .in('document_id', documentIds);
      processData = data || [];
    }

    // Create a map of document_id -> stage
    const stageMap = new Map<string, string>();
    processData.forEach((pd: any) => {
      if (!stageMap.has(pd.document_id) && pd.processes?.current_stage) {
        stageMap.set(pd.document_id, pd.processes.current_stage);
      }
    });

    // Filter by stage if needed
    let filteredDocuments = documents || [];
    if (filters.stages && filters.stages.length > 0) {
      filteredDocuments = filteredDocuments.filter(doc => {
        const stage = stageMap.get(doc.id);
        return stage && filters.stages!.includes(stage);
      });
    }

    // Generate results with highlights
    const results = filteredDocuments.map((doc: any) => {
      let highlights: string[] = [];

      if (includeHighlights && doc.raw_content) {
        const content = doc.raw_content.substring(0, 5000);
        const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        
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

      const stage = stageMap.get(doc.id) || null;

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
    });

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
