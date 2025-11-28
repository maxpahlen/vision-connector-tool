import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EntityAutocompleteResult {
  id: string;
  name: string;
  entity_type: string;
  role: string | null;
  document_count: number;
}

interface UseEntityAutocompleteParams {
  query: string;
  entity_types?: string[];
  enabled?: boolean;
}

export function useEntityAutocomplete({
  query,
  entity_types,
  enabled = true,
}: UseEntityAutocompleteParams) {
  return useQuery({
    queryKey: ['entity-autocomplete', query, entity_types],
    queryFn: async () => {
      if (!query || query.trim().length < 2) {
        return { results: [], total: 0 };
      }

      const { data, error } = await supabase.functions.invoke('search-entities', {
        body: {
          query: query.trim(),
          entity_types,
          limit: 10,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.message || 'Entity search failed');

      return data as { results: EntityAutocompleteResult[]; total: number };
    },
    enabled: enabled && query.trim().length >= 2,
    staleTime: 60000, // Cache for 60 seconds
  });
}
