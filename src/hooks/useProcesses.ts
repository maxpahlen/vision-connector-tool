import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Process {
  id: string;
  process_key: string;
  title: string;
  ministry: string | null;
  current_stage: string;
  directive_number: string | null;
  created_at: string;
  updated_at: string;
  document_count?: number;
}

export function useProcesses() {
  const { data: processes = [], isLoading } = useQuery({
    queryKey: ['processes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('processes')
        .select(`
          *,
          process_documents(count)
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      return data.map((p: any) => ({
        ...p,
        document_count: p.process_documents?.[0]?.count || 0,
      })) as Process[];
    },
    refetchInterval: 10000,
  });

  return { processes, isLoading };
}
