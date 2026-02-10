import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Play, CheckCircle2, XCircle } from 'lucide-react';

interface MismatchedDocument {
  process_id: string;
  process_key: string;
  title: string;
  document_id: string;
  doc_number: string;
  doc_title: string;
  pdf_url: string;
}

export function TimelineAgentTest() {
  const [documents, setDocuments] = useState<MismatchedDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const loadMismatchedDocuments = async () => {
    setLoadingDocs(true);
    try {
      // Query processes marked as 'published' with SOU documents but missing sou_published events
      const { data: processData, error: processError } = await supabase
        .from('processes')
        .select(`
          id,
          process_key,
          title,
          current_stage,
          process_documents!inner (
            document_id,
            documents!inner (
              id,
              doc_number,
              title,
              doc_type,
              pdf_url
            )
          )
        `)
        .eq('current_stage', 'published')
        .eq('process_documents.documents.doc_type', 'sou')
        .limit(12);

      if (processError) throw processError;

      // Map the nested structure to flat documents
      const mapped = processData?.flatMap(p => 
        (p.process_documents as any[]).map((pd: any) => ({
          process_id: p.id,
          process_key: p.process_key,
          title: p.title,
          document_id: pd.documents.id,
          doc_number: pd.documents.doc_number,
          doc_title: pd.documents.title,
          pdf_url: pd.documents.pdf_url,
        }))
      ) || [];

      setDocuments(mapped);
      
      toast({
        title: "Documents loaded",
        description: `Found ${mapped.length} mismatched documents`,
      });
    } catch (error) {
      console.error('Error loading documents:', error);
      toast({
        title: "Error loading documents",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoadingDocs(false);
    }
  };

  const runTimelineAgent = async () => {
    if (!selectedDocId) {
      toast({
        title: "No document selected",
        description: "Please select a document first",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setResult(null);

    const selectedDoc = documents.find(d => d.document_id === selectedDocId);
    if (!selectedDoc) return;

    try {
      console.log('[Timeline Agent Test] Calling agent-timeline', {
        document_id: selectedDoc.document_id,
        process_id: selectedDoc.process_id,
        doc_number: selectedDoc.doc_number,
      });

      const { data, error } = await supabase.functions.invoke('agent-timeline', {
        body: {
          document_id: selectedDoc.document_id,
          process_id: selectedDoc.process_id,
        },
      });

      if (error) throw error;

      console.log('[Timeline Agent Test] Result:', data);
      setResult(data);

      if (data.success) {
        toast({
          title: "✅ Timeline event extracted!",
          description: `Event created: ${data.event.event_type} on ${data.event.event_date}`,
        });
      } else if (data.skipped) {
        toast({
          title: "⚠️ Event skipped",
          description: data.reason || "No valid evidence found",
          variant: "default",
        });
      }
    } catch (error) {
      console.error('[Timeline Agent Test] Error:', error);
      setResult({ error: error instanceof Error ? error.message : 'Unknown error' });
      toast({
        title: "❌ Error running Timeline Agent",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const selectedDoc = documents.find(d => d.document_id === selectedDocId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          Timeline Agent v1 Test
        </CardTitle>
        <CardDescription>
          Test the Timeline Agent on mismatched SOU documents (published but missing sou_published events)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button 
            onClick={loadMismatchedDocuments} 
            disabled={loadingDocs}
            variant="outline"
          >
            {loadingDocs ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              'Load Mismatched Documents'
            )}
          </Button>
          {documents.length > 0 && (
            <Badge variant="secondary">
              {documents.length} documents
            </Badge>
          )}
        </div>

        {documents.length > 0 && (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Document</label>
              <Select value={selectedDocId} onValueChange={setSelectedDocId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a document to test..." />
                </SelectTrigger>
                <SelectContent>
                  {documents.map((doc) => (
                    <SelectItem key={doc.document_id} value={doc.document_id}>
                      {doc.doc_number} - {doc.doc_title.substring(0, 60)}...
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedDoc && (
              <div className="rounded-lg bg-muted p-4 space-y-2 text-sm">
                <div><strong>Document:</strong> {selectedDoc.doc_number}</div>
                <div><strong>Title:</strong> {selectedDoc.doc_title}</div>
                <div><strong>Process:</strong> {selectedDoc.process_key}</div>
                <div className="text-xs text-muted-foreground">
                  Document ID: {selectedDoc.document_id}
                </div>
              </div>
            )}

            <Button 
              onClick={runTimelineAgent}
              disabled={!selectedDocId || loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Running Timeline Agent...
                </>
              ) : (
                <>
                  <Play className="mr-2 h-4 w-4" />
                  Run Timeline Agent v1
                </>
              )}
            </Button>
          </>
        )}

        {result && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              {result.success ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  <span className="text-green-700">Success</span>
                </>
              ) : result.error ? (
                <>
                  <XCircle className="h-5 w-5 text-destructive" />
                  <span className="text-destructive">Error</span>
                </>
              ) : (
                <>
                  <Badge variant="outline">Skipped</Badge>
                </>
              )}
            </div>

            {result.success && result.event && (
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><strong>Event Type:</strong></div>
                  <div><Badge>{result.event.event_type}</Badge></div>
                  
                  <div><strong>Event Date:</strong></div>
                  <div>{result.event.event_date}</div>
                  
                  <div><strong>Page:</strong></div>
                  <div>{result.event.source_page}</div>
                  
                  <div><strong>Description:</strong></div>
                  <div className="col-span-1">{result.event.description}</div>
                </div>

                <div className="space-y-1">
                  <strong>Source Excerpt:</strong>
                  <div className="rounded bg-muted p-2 text-xs font-mono overflow-x-auto">
                    {result.event.source_excerpt}
                  </div>
                </div>

                {result.event.actors && result.event.actors.length > 0 && (
                  <div className="space-y-1">
                    <strong>Actors:</strong>
                    <div className="flex flex-wrap gap-1">
                      {result.event.actors.map((actor: any, i: number) => (
                        <Badge key={i} variant="secondary">
                          {actor.name} ({actor.role})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {result.skipped && (
              <div className="text-sm space-y-2">
                <div><strong>Reason:</strong> {result.reason}</div>
                {result.model_response && (
                  <div className="text-xs text-muted-foreground">
                    <strong>Model response:</strong> {result.model_response}
                  </div>
                )}
              </div>
            )}

            {result.error && (
              <div className="text-sm text-destructive">
                {result.error}
              </div>
            )}

            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                View full response
              </summary>
              <pre className="mt-2 rounded bg-muted p-2 overflow-x-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
