import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Network, FileText, Users, Calendar, Building2, ArrowLeft, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

const ENTITY_TYPE_ICONS = {
  person: User,
  ministry: Building2,
  committee: Users,
  organization: Building2,
} as const;

export default function ProcessDetail() {
  const { id } = useParams<{ id: string }>();

  // Fetch process details
  const { data: process, isLoading: processLoading, error: processError } = useQuery({
    queryKey: ['process', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('processes')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('Process not found');
      return data;
    },
    enabled: !!id,
  });

  // Fetch documents in this process
  const { data: documents, isLoading: documentsLoading } = useQuery({
    queryKey: ['process-documents', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('process_documents')
        .select(`
          role,
          documents (
            id,
            title,
            doc_type,
            doc_number,
            ministry,
            publication_date,
            processed_at
          )
        `)
        .eq('process_id', id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // Fetch all unique entities from process documents via relations table
  const { data: entities, isLoading: entitiesLoading } = useQuery({
    queryKey: ['process-entities', id],
    queryFn: async () => {
      const documentIds = documents?.map(d => (d.documents as any)?.id).filter(Boolean) || [];
      
      if (documentIds.length === 0) return [];

      // Query entities via relations table (entity -> document relations)
      const { data: relations, error } = await supabase
        .from('relations')
        .select(`
          relation_type,
          source_id,
          entities!relations_source_id_fkey (
            id,
            name,
            entity_type,
            role
          )
        `)
        .in('target_id', documentIds)
        .eq('source_type', 'entity')
        .eq('target_type', 'document');

      if (error) throw error;

      // Deduplicate entities by name and type, keeping track of document count and roles
      const entityMap = new Map<string, {
        id: string;
        name: string;
        entity_type: string;
        roles: Set<string>;
        documentCount: number;
      }>();

      relations?.forEach(rel => {
        const entity = rel.entities as any;
        if (!entity) return;
        
        const key = `${entity.name}-${entity.entity_type}`;
        if (entityMap.has(key)) {
          const existing = entityMap.get(key)!;
          existing.documentCount++;
          if (entity.role) existing.roles.add(entity.role);
        } else {
          entityMap.set(key, {
            id: entity.id,
            name: entity.name,
            entity_type: entity.entity_type,
            roles: entity.role ? new Set([entity.role]) : new Set(),
            documentCount: 1,
          });
        }
      });

      return Array.from(entityMap.values())
        .map(e => ({
          ...e,
          roles: Array.from(e.roles),
        }))
        .sort((a, b) => b.documentCount - a.documentCount);
    },
    enabled: !!id && !!documents && documents.length > 0,
  });

  // Fetch timeline events for this process
  const { data: timelineEvents, isLoading: timelineLoading } = useQuery({
    queryKey: ['process-timeline', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('timeline_events')
        .select('*')
        .eq('process_id', id)
        .order('event_date', { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  if (processLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Skeleton className="h-12 w-3/4 mb-4" />
          <Skeleton className="h-6 w-1/2 mb-8" />
          <div className="grid gap-6 lg:grid-cols-3">
            <Skeleton className="h-96 lg:col-span-2" />
            <Skeleton className="h-96" />
          </div>
        </main>
      </div>
    );
  }

  if (processError || !process) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <Alert variant="destructive">
            <AlertDescription>
              {processError ? 'Ett fel uppstod vid hämtning av process.' : 'Process hittades inte.'}
            </AlertDescription>
          </Alert>
          <Link to="/search">
            <Button variant="ghost" className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Tillbaka till sökning
            </Button>
          </Link>
        </main>
      </div>
    );
  }

  const directives = documents?.filter(d => (d.documents as any)?.doc_type === 'directive') || [];
  const investigations = documents?.filter(d => (d.documents as any)?.doc_type === 'sou') || [];
  const propositions = documents?.filter(d => (d.documents as any)?.doc_type === 'proposition') || [];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        {/* Process Header */}
        <div className="mb-8">
          <Link to="/search">
            <Button variant="ghost" className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Tillbaka till sökning
            </Button>
          </Link>
          
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-muted">
              <Network className="h-8 w-8" />
            </div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">{process.title}</h1>
              <div className="flex items-center gap-3 flex-wrap mb-4">
                <Badge variant="outline" className="text-sm">
                  {process.process_key}
                </Badge>
                <Badge variant="default" className="text-sm">
                  {process.current_stage}
                </Badge>
                {process.directive_number && (
                  <span className="text-sm text-muted-foreground">
                    Direktiv: {process.directive_number}
                  </span>
                )}
              </div>
              {process.stage_explanation && (
                <p className="text-muted-foreground mb-2">{process.stage_explanation}</p>
              )}
              {process.ministry && (
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{process.ministry}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Documents */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Dokument ({documents?.length || 0})
                </CardTitle>
                <CardDescription>
                  Direktiv, utredningar och propositioner i denna process
                </CardDescription>
              </CardHeader>
              <CardContent>
                {documentsLoading ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
                  </div>
                ) : documents && documents.length > 0 ? (
                  <div className="space-y-6">
                    {/* Directives Section */}
                    {directives.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                          DIREKTIV ({directives.length})
                        </h3>
                        <div className="space-y-3">
                          {directives.map((item) => {
                            const doc = item.documents as any;
                            if (!doc) return null;
                            
                            return (
                              <Link
                                key={doc.id}
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
                                      <Badge variant="secondary" className="text-xs">
                                        {item.role}
                                      </Badge>
                                    </div>
                                    <h4 className="font-medium mb-1 line-clamp-2">{doc.title}</h4>
                                    {doc.ministry && (
                                      <p className="text-sm text-muted-foreground">{doc.ministry}</p>
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
                      </div>
                    )}

                    {/* Investigations Section */}
                    {investigations.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                          UTREDNINGAR ({investigations.length})
                        </h3>
                        <div className="space-y-3">
                          {investigations.map((item) => {
                            const doc = item.documents as any;
                            if (!doc) return null;
                            
                            return (
                              <Link
                                key={doc.id}
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
                                      {doc.processed_at && (
                                        <Badge variant="default" className="text-xs">
                                          Processed
                                        </Badge>
                                      )}
                                    </div>
                                    <h4 className="font-medium mb-1 line-clamp-2">{doc.title}</h4>
                                    {doc.ministry && (
                                      <p className="text-sm text-muted-foreground">{doc.ministry}</p>
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
                      </div>
                    )}

                    {/* Propositions Section */}
                    {propositions.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
                          PROPOSITIONER ({propositions.length})
                        </h3>
                        <div className="space-y-3">
                          {propositions.map((item) => {
                            const doc = item.documents as any;
                            if (!doc) return null;
                            
                            return (
                              <Link
                                key={doc.id}
                                to={`/document/${doc.id}`}
                                className="block p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      <Badge variant="outline" className="text-xs">
                                        PROP
                                      </Badge>
                                      <span className="text-sm font-medium">{doc.doc_number}</span>
                                      <Badge variant="secondary" className="text-xs">
                                        {item.role}
                                      </Badge>
                                    </div>
                                    <h4 className="font-medium mb-1 line-clamp-2">{doc.title}</h4>
                                    {doc.ministry && (
                                      <p className="text-sm text-muted-foreground">{doc.ministry}</p>
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
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Inga dokument hittades
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Timeline Events */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Tidslinje ({timelineEvents?.length || 0})
                </CardTitle>
                <CardDescription>
                  Viktiga händelser och milstolpar i processen
                </CardDescription>
              </CardHeader>
              <CardContent>
                {timelineLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}
                  </div>
                ) : timelineEvents && timelineEvents.length > 0 ? (
                  <div className="space-y-4">
                    {timelineEvents.map((event) => (
                      <div key={event.id} className="border-l-2 border-primary pl-4 py-2">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-sm font-semibold">
                            {format(new Date(event.event_date), 'PPP', { locale: sv })}
                          </p>
                          <Badge variant="outline" className="text-xs">
                            {event.event_type}
                          </Badge>
                        </div>
                        {event.description && (
                          <p className="text-sm mb-2">{event.description}</p>
                        )}
                        {event.source_excerpt && (
                          <div className="text-xs text-muted-foreground italic pl-2 border-l-2 border-muted">
                            &quot;{event.source_excerpt}&quot;
                            {event.source_page && ` (sida ${event.source_page})`}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-center py-8">
                    Inga händelser registrerade
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Entities */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Users className="h-5 w-5" />
                  Involverade ({entities?.length || 0})
                </CardTitle>
                <CardDescription>
                  Personer och organisationer i denna process
                </CardDescription>
              </CardHeader>
              <CardContent>
                {entitiesLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
                  </div>
                ) : entities && entities.length > 0 ? (
                  <div className="space-y-2">
                    {entities.map((entity) => {
                      const Icon = ENTITY_TYPE_ICONS[entity.entity_type as keyof typeof ENTITY_TYPE_ICONS] || User;
                      
                      return (
                        <Link
                          key={entity.id}
                          to={`/entity/${entity.id}`}
                          className="flex items-start gap-2 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                        >
                          <Icon className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-1" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{entity.name}</p>
                            {entity.roles && entity.roles.length > 0 && (
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {entity.roles.join(', ')}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {entity.documentCount} dokument
                            </p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Inga entiteter hittades
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Process Metadata */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Processinfo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Skapad:</span>
                  <span>{format(new Date(process.created_at!), 'PPP', { locale: sv })}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Uppdaterad:</span>
                  <span>{format(new Date(process.updated_at!), 'PPP', { locale: sv })}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Dokument:</span>
                  <span>{documents?.length || 0}</span>
                </div>
                <Separator />
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Händelser:</span>
                  <span>{timelineEvents?.length || 0}</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

