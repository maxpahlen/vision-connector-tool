import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, ExternalLink, FileText, Calendar, Building2, Link as LinkIcon, Network, User, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useDocumentContext } from '@/hooks/useDocumentContext';

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: document, isLoading } = useQuery({
    queryKey: ['document', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
  });

  const { data: context, isLoading: contextLoading } = useDocumentContext(id);

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Document not found</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Tillbaka
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getExtractionStatus = () => {
    const hasContent = document.raw_content && document.raw_content.length > 100;
    const metadata = document.metadata as Record<string, any> | null;
    
    if (hasContent) {
      return {
        label: 'Extracted',
        variant: 'default' as const,
        description: `${(document.raw_content?.length || 0).toLocaleString()} characters`,
      };
    }
    if (metadata?.pdf_status === 'found') {
      return {
        label: 'Pending Extraction',
        variant: 'secondary' as const,
        description: 'PDF found, awaiting text extraction',
      };
    }
    return {
      label: 'No Content',
      variant: 'destructive' as const,
      description: 'No PDF found or extraction failed',
    };
  };

  const status = getExtractionStatus();

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header with navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Tillbaka
        </Button>
        {document.url && (
          <a href={document.url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline">
              <ExternalLink className="mr-2 h-4 w-4" />
              View on Regeringen
            </Button>
          </a>
        )}
      </div>

      {/* Document Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{document.doc_type}</Badge>
                <Badge>{document.doc_number}</Badge>
              </div>
              <CardTitle className="text-2xl">{document.title}</CardTitle>
            </div>
            <Badge variant={status.variant} className="ml-4">
              {status.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {document.ministry && (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{document.ministry}</span>
              </div>
            )}
            {document.publication_date && (
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {new Date(document.publication_date).toLocaleDateString()}
                </span>
              </div>
            )}
            {document.pdf_url && (
              <div className="flex items-center gap-2">
                <LinkIcon className="h-4 w-4 text-muted-foreground" />
                <a 
                  href={document.pdf_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline truncate"
                >
                  PDF Link
                </a>
              </div>
            )}
          </div>
          
          <div className="text-sm text-muted-foreground">
            {status.description}
          </div>
        </CardContent>
      </Card>

      {/* Extracted Content Preview */}
      {document.raw_content && document.raw_content.length > 100 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Extracted Text Content
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] w-full rounded-md border p-4">
              <pre className="text-sm whitespace-pre-wrap font-mono">
                {document.raw_content}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Process Context */}
      {!contextLoading && context?.process && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="h-5 w-5" />
              Process Context
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Link 
                to={`/process/${context.process.id}`}
                className="text-lg font-semibold hover:underline"
              >
                {context.process.title}
              </Link>
              <p className="text-sm text-muted-foreground">{context.process.process_key}</p>
            </div>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Stage:</span>
                <Badge>{context.process.current_stage}</Badge>
              </div>
              {context.process.stage_explanation && (
                <p className="text-sm text-muted-foreground">{context.process.stage_explanation}</p>
              )}
              {context.process.ministry && (
                <div className="flex items-center gap-2 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{context.process.ministry}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Entities in Document */}
      {!contextLoading && context?.entities && context.entities.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Entities in Document ({context.entities.length})
            </CardTitle>
            <CardDescription>
              People, organizations, and committees mentioned in this document
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {context.entities.map((entity) => (
                <Link
                  key={entity.id}
                  to={`/entity/${entity.id}`}
                  className="group"
                >
                  <Badge 
                    variant="secondary" 
                    className="cursor-pointer hover:bg-secondary/80 transition-colors"
                  >
                    <User className="h-3 w-3 mr-1" />
                    {entity.name}
                    {entity.role && (
                      <span className="ml-1 text-xs opacity-70">
                        ({entity.role})
                      </span>
                    )}
                  </Badge>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Related Documents */}
      {!contextLoading && context?.relatedDocuments && context.relatedDocuments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Related Documents ({context.relatedDocuments.length})
            </CardTitle>
            <CardDescription>
              Documents connected through shared entities and context
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {context.relatedDocuments.map((relDoc) => (
                <Link
                  key={relDoc.id}
                  to={`/document/${relDoc.id}`}
                  className="block p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {relDoc.doc_type.toUpperCase()}
                        </Badge>
                        <span className="text-sm font-medium">{relDoc.doc_number}</span>
                        <Badge variant="secondary" className="text-xs">
                          Score: {relDoc.score}
                        </Badge>
                      </div>
                      <h3 className="font-medium mb-1 line-clamp-2">{relDoc.title}</h3>
                      {relDoc.ministry && (
                        <p className="text-sm text-muted-foreground">{relDoc.ministry}</p>
                      )}
                    </div>
                    {relDoc.publication_date && (
                      <div className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(relDoc.publication_date).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  
                  {/* Explainable Reasons */}
                  <div className="space-y-2 pl-4 border-l-2 border-muted">
                    {relDoc.reasons.map((reason, idx) => (
                      <div key={idx} className="text-sm">
                        <span className="font-medium">
                          {reason.type === 'lead' && '👤 Shared lead investigator: '}
                          {reason.type === 'committee' && '👥 Shared committee member: '}
                          {reason.type === 'ministry' && '🏛️ Same ministry: '}
                        </span>
                        <span className="text-muted-foreground">
                          {reason.entityName || reason.detail}
                        </span>
                        {reason.excerpt && (
                          <p className="text-xs text-muted-foreground italic mt-1">
                            "{reason.excerpt}"
                            {reason.page && ` (page ${reason.page})`}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      {document.metadata && Object.keys(document.metadata).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Extraction Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] w-full">
              <pre className="text-xs whitespace-pre-wrap font-mono">
                {JSON.stringify(document.metadata, null, 2)}
              </pre>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Document Timeline</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Created</span>
              <span>{new Date(document.created_at!).toLocaleString()}</span>
            </div>
            <Separator />
            {document.updated_at && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Last Updated</span>
                  <span>{new Date(document.updated_at).toLocaleString()}</span>
                </div>
                <Separator />
              </>
            )}
            {document.processed_at && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Processed</span>
                <span>{new Date(document.processed_at).toLocaleString()}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
