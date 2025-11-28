import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useDocumentCount() {
  return useQuery({
    queryKey: ['document-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true });

      if (error) throw error;
      return count || 0;
    },
    staleTime: 60000, // Cache for 1 minute
  });
}
