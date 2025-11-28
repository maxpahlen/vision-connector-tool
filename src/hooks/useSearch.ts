import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SearchFilters {
  doc_types?: string[];
  ministries?: string[];
  stages?: string[];
  date_from?: string;
  date_to?: string;
}

export interface SearchResult {
  id: string;
  doc_type: string;
  doc_number: string;
  title: string;
  ministry: string | null;
  publication_date: string | null;
  stage: string | null;
  highlights?: string[];
}

export interface SearchResponse {
  results: SearchResult[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
  };
}

interface UseSearchParams {
  query: string;
  filters?: SearchFilters;
  page?: number;
  perPage?: number;
  enabled?: boolean;
}

export function useSearch({
  query,
  filters,
  page = 1,
  perPage = 20,
  enabled = true,
}: UseSearchParams) {
  return useQuery({
    queryKey: ['search', query, filters, page, perPage],
    queryFn: async () => {
      if (!query || query.trim().length === 0) {
        return {
          results: [],
          pagination: {
            page: 1,
            per_page: perPage,
            total: 0,
            total_pages: 0,
          },
        };
      }

      const { data, error } = await supabase.functions.invoke('search-documents', {
        body: {
          query: query.trim(),
          filters,
          pagination: {
            page,
            per_page: perPage,
          },
          options: {
            include_highlights: true,
          },
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message || 'Search failed');

      return data as SearchResponse;
    },
    enabled: enabled && query.trim().length > 0,
    staleTime: 30000, // Cache for 30 seconds
  });
}
