import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, ExternalLink, FileText, Calendar, Building2, Link as LinkIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();

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
            <Link to="/search">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Tillbaka till sökning
              </Button>
            </Link>
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
        <Link to="/search">
          <Button variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Tillbaka till sökning
          </Button>
        </Link>
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
