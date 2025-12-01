import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { User, Building2, Users, FileText, Link2, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

const ENTITY_TYPE_ICONS = {
  person: User,
  ministry: Building2,
  committee: Users,
  organization: Building2,
} as const;

const ENTITY_TYPE_LABELS = {
  person: 'Person',
  ministry: 'Departement',
  committee: 'Kommitté',
  organization: 'Organisation',
} as const;

export default function EntityDetail() {
  const { id } = useParams<{ id: string }>();

  // Fetch entity details
  const { data: entity, isLoading: entityLoading, error: entityError } = useQuery({
    queryKey: ['entity', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entities')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Entity not found');
      return data;
    },
    enabled: !!id,
  });

  // Fetch documents related to this entity
  const { data: documents, isLoading: documentsLoading } = useQuery({
    queryKey: ['entity-documents', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('relations')
        .select(`
          id,
          relation_type,
          source_page,
          source_excerpt,
          documents!relations_target_id_fkey (
            id,
            doc_type,
            doc_number,
            title,
            ministry,
            publication_date
          )
        `)
        .eq('source_id', id)
        .eq('source_type', 'entity')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // Fetch related entities (other entities this entity is connected to)
  const { data: relatedEntities, isLoading: relatedEntitiesLoading } = useQuery({
    queryKey: ['entity-related', id],
    queryFn: async () => {
      // Find entities that appear in the same documents
      const { data: sameDocRelations, error } = await supabase
        .from('relations')
        .select(`
          source_document_id,
          target_id,
          entities!relations_target_id_fkey (
            id,
            name,
            entity_type,
            role
          )
        `)
        .eq('target_type', 'entity')
        .neq('target_id', id)
        .in('source_document_id', 
          documents?.map(d => (d.documents as any).id).filter(Boolean) || []
        );

      if (error) throw error;

      // Deduplicate entities and count connections
      const entityMap = new Map<string, { entity: any; count: number }>();
      sameDocRelations?.forEach(rel => {
        const entity = (rel as any).entities;
        if (entity && entity.id) {
          if (entityMap.has(entity.id)) {
            entityMap.get(entity.id)!.count++;
          } else {
            entityMap.set(entity.id, { entity, count: 1 });
          }
        }
      });

      return Array.from(entityMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10); // Top 10 related entities
    },
    enabled: !!id && !!documents && documents.length > 0,
  });

  // Fetch timeline events from documents this entity is involved in
  const { data: timelineEvents, isLoading: timelineLoading } = useQuery({
    queryKey: ['entity-timeline', id],
    queryFn: async () => {
      const documentIds = documents?.map(d => (d.documents as any)?.id).filter(Boolean) || [];
      
      if (documentIds.length === 0) return [];

      // Get processes linked to these documents
      const { data: processLinks, error: processError } = await supabase
        .from('process_documents')
        .select('process_id')
        .in('document_id', documentIds);

      if (processError) throw processError;

      const processIds = [...new Set(processLinks?.map(p => p.process_id) || [])];

      if (processIds.length === 0) return [];

      // Get timeline events for these processes
      const { data, error } = await supabase
        .from('timeline_events')
        .select(`
          id,
          event_type,
          event_date,
          description,
          source_excerpt,
          source_page,
          processes!timeline_events_process_id_fkey (
            id,
            title,
            process_key
          )
        `)
        .in('process_id', processIds)
        .order('event_date', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data || [];
    },
    enabled: !!id && !!documents && documents.length > 0,
  });

  if (entityLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Skeleton className="h-12 w-3/4 mb-4" />
          <Skeleton className="h-6 w-1/2 mb-8" />
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </main>
      </div>
    );
  }

  if (entityError || !entity) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Alert variant="destructive">
            <AlertDescription>
              {entityError ? 'Ett fel uppstod vid hämtning av entitet.' : 'Entitet hittades inte.'}
            </AlertDescription>
          </Alert>
          <Link to="/search" className="text-primary hover:underline mt-4 inline-block">
            ← Tillbaka till sökning
          </Link>
        </main>
      </div>
    );
  }

  const Icon = ENTITY_TYPE_ICONS[entity.entity_type as keyof typeof ENTITY_TYPE_ICONS] || User;
  const typeLabel = ENTITY_TYPE_LABELS[entity.entity_type as keyof typeof ENTITY_TYPE_LABELS] || entity.entity_type;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {/* Entity Header */}
        <div className="mb-8">
          <Link to="/search" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">
            ← Tillbaka till sökning
          </Link>
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-muted">
              <Icon className="h-8 w-8" />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">{entity.name}</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">{typeLabel}</Badge>
                {entity.role && (
                  <span className="text-muted-foreground">{entity.role}</span>
                )}
                {documents && documents.length > 0 && (
                  <span className="text-sm text-muted-foreground">
                    · {documents.length} dokument
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Documents */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Dokument ({documents?.length || 0})
              </CardTitle>
              <CardDescription>
                Dokument där denna entitet förekommer
              </CardDescription>
            </CardHeader>
            <CardContent>
              {documentsLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
                </div>
              ) : documents && documents.length > 0 ? (
                <div className="space-y-4">
                  {documents.map((rel) => {
                    const doc = rel.documents as any;
                    if (!doc) return null;

                    return (
                      <Link
                        key={rel.id}
                        to={`/document/${doc.id}`}
                        className="block p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="text-xs">
                                {doc.doc_type.toUpperCase()}
                              </Badge>
                              <span className="text-sm font-medium">{doc.doc_number}</span>
                            </div>
                            <h3 className="font-medium mb-1 line-clamp-2">{doc.title}</h3>
                            {doc.ministry && (
                              <p className="text-sm text-muted-foreground">{doc.ministry}</p>
                            )}
                            {rel.source_excerpt && (
                              <p className="text-sm text-muted-foreground mt-2 line-clamp-2 italic">
                                "{rel.source_excerpt}"
                              </p>
                            )}
                          </div>
                          {doc.publication_date && (
                            <div className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(doc.publication_date), 'yyyy-MM-dd')}
                            </div>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  Inga dokument hittades
                </p>
              )}
            </CardContent>
          </Card>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Related Entities */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Link2 className="h-5 w-5" />
                  Relaterade entiteter
                </CardTitle>
                <CardDescription>
                  Entiteter som förekommer i samma dokument
                </CardDescription>
              </CardHeader>
              <CardContent>
                {relatedEntitiesLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}
                  </div>
                ) : relatedEntities && relatedEntities.length > 0 ? (
                  <div className="space-y-2">
                    {relatedEntities.map(({ entity: relEntity, count }) => {
                      const RelIcon = ENTITY_TYPE_ICONS[relEntity.entity_type as keyof typeof ENTITY_TYPE_ICONS] || User;
                      const relTypeLabel = ENTITY_TYPE_LABELS[relEntity.entity_type as keyof typeof ENTITY_TYPE_LABELS] || relEntity.entity_type;

                      return (
                        <Link
                          key={relEntity.id}
                          to={`/entity/${relEntity.id}`}
                          className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 transition-colors"
                        >
                          <RelIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{relEntity.name}</p>
                            <p className="text-xs text-muted-foreground">{relTypeLabel}</p>
                          </div>
                          <Badge variant="secondary" className="text-xs">
                            {count}
                          </Badge>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Inga relaterade entiteter
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Timeline Events */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Calendar className="h-5 w-5" />
                  Tidslinje ({timelineEvents?.length || 0})
                </CardTitle>
                <CardDescription>
                  Händelser från relaterade processer
                </CardDescription>
              </CardHeader>
              <CardContent>
                {timelineLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
                  </div>
                ) : timelineEvents && timelineEvents.length > 0 ? (
                  <div className="space-y-4">
                    {timelineEvents.map((event) => {
                      const process = (event as any).processes;
                      return (
                        <div key={event.id} className="border-l-2 border-muted pl-4 py-2">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              {format(new Date(event.event_date), 'PPP', { locale: sv })}
                            </p>
                            <Badge variant="outline" className="text-xs">
                              {event.event_type}
                            </Badge>
                          </div>
                          {event.description && (
                            <p className="text-sm mb-1">{event.description}</p>
                          )}
                          {process && (
                            <p className="text-xs text-muted-foreground truncate">
                              {process.title}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Inga händelser hittades
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
