import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';

export interface Document {
  id: string;
  doc_number: string;
  doc_type: string;
  title: string;
  url: string | null;
  pdf_url: string | null;
  raw_content: string | null;
  ministry: string | null;
  publication_date: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
}

export function useDocuments() {
  const [docTypeFilter, setDocTypeFilter] = useState<string | null>(null);
  const [extractionStatusFilter, setExtractionStatusFilter] = useState<string | null>(null);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', docTypeFilter, extractionStatusFilter],
    queryFn: async () => {
      let query = supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (docTypeFilter) {
        query = query.eq('doc_type', docTypeFilter);
      }

      if (extractionStatusFilter === 'extracted') {
        query = query.not('raw_content', 'is', null);
      } else if (extractionStatusFilter === 'pending') {
        query = query.is('raw_content', null);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Document[];
    },
    refetchInterval: 10000,
  });

  return {
    documents,
    isLoading,
    docTypeFilter,
    setDocTypeFilter,
    extractionStatusFilter,
    setExtractionStatusFilter,
  };
}
