import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface Entity {
  id: string;
  name: string;
  entity_type: string;
  role: string | null;
  source_excerpt: string | null;
  source_page: number | null;
}

interface Process {
  id: string;
  title: string;
  process_key: string;
  current_stage: string;
  stage_explanation: string | null;
  ministry: string | null;
}

interface RelationReason {
  type: 'lead' | 'committee' | 'ministry';
  detail: string;
  entityName?: string;
  excerpt?: string;
  page?: number;
}

interface RelatedDocument {
  id: string;
  title: string;
  doc_type: string;
  doc_number: string;
  ministry: string | null;
  publication_date: string | null;
  score: number;
  reasons: RelationReason[];
}

export function useDocumentContext(documentId: string | undefined) {
  return useQuery({
    queryKey: ['document-context', documentId],
    queryFn: async () => {
      if (!documentId) throw new Error('Document ID required');

      // 1. Get document with process information
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .select(`
          id,
          title,
          doc_type,
          doc_number,
          ministry,
          process_documents (
            processes (
              id,
              title,
              process_key,
              current_stage,
              stage_explanation,
              ministry
            )
          )
        `)
        .eq('id', documentId)
        .single();

      if (docError) throw docError;

      const process = docData.process_documents?.[0]?.processes as Process | null;

      // 2. Get entities from this document
      const { data: entities, error: entitiesError } = await supabase
        .from('entities')
        .select('id, name, entity_type, role, source_excerpt, source_page')
        .eq('source_document_id', documentId)
        .order('name');

      if (entitiesError) throw entitiesError;

      // 3. Get related documents via shared entities
      const relatedDocumentsMap = new Map<string, {
        document: any;
        score: number;
        reasons: RelationReason[];
      }>();

      if (entities && entities.length > 0) {
        // Find documents with entities matching by name and type
        const entityNames = entities.map(e => e.name);
        
        const { data: relatedEntities, error: relatedError } = await supabase
          .from('entities')
          .select(`
            id,
            name,
            entity_type,
            role,
            source_excerpt,
            source_page,
            source_document_id,
            documents!entities_source_document_id_fkey (
              id,
              title,
              doc_type,
              doc_number,
              ministry,
              publication_date
            )
          `)
          .in('name', entityNames)
          .neq('source_document_id', documentId);

        if (relatedError) throw relatedError;

        // Score and aggregate related documents
        relatedEntities?.forEach((relEntity: any) => {
          const doc = relEntity.documents;
          if (!doc) return;

          const docId = doc.id;
          const role = (relEntity.role || '').toLowerCase();

          // Determine score and reason type
          let scoreIncrement = 0;
          let reasonType: 'lead' | 'committee' | 'ministry' = 'ministry';
          
          if (role.includes('särskild utredare') || role.includes('huvudutredare') || role.includes('utredare')) {
            scoreIncrement = 3;
            reasonType = 'lead';
          } else if (role.includes('ledamot') || role.includes('kommitté')) {
            scoreIncrement = 2;
            reasonType = 'committee';
          }

          if (!relatedDocumentsMap.has(docId)) {
            relatedDocumentsMap.set(docId, {
              document: doc,
              score: 0,
              reasons: [],
            });
          }

          const entry = relatedDocumentsMap.get(docId)!;
          entry.score += scoreIncrement;

          // Add reason with citation
          if (scoreIncrement > 0) {
            entry.reasons.push({
              type: reasonType,
              detail: relEntity.role || 'Shared entity',
              entityName: relEntity.name,
              excerpt: relEntity.source_excerpt || undefined,
              page: relEntity.source_page || undefined,
            });
          }
        });

        // Add ministry-based scoring
        const currentMinistry = docData.ministry;
        if (currentMinistry) {
          relatedDocumentsMap.forEach((entry, docId) => {
            if (entry.document.ministry === currentMinistry) {
              entry.score += 1;
              entry.reasons.push({
                type: 'ministry',
                detail: currentMinistry,
              });
            }
          });
        }
      }

      // Convert to array and sort by score
      const relatedDocuments: RelatedDocument[] = Array.from(relatedDocumentsMap.values())
        .map(entry => ({
          ...entry.document,
          score: entry.score,
          reasons: entry.reasons,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10); // Top 10

      return {
        process,
        entities: (entities || []) as Entity[],
        relatedDocuments,
      };
    },
    enabled: !!documentId,
  });
}
