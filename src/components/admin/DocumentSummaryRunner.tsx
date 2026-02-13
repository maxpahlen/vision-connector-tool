import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Brain, Play, Loader2, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface BatchResult {
  id: string;
  doc_number: string;
  doc_type: string;
  status: string;
  strategy?: string;
  error?: string;
}

interface CorpusStats {
  doc_type: string;
  total: number;
  has_content: number;
  summarized: number;
}

function useCorpusStats() {
  return useQuery({
    queryKey: ['corpus-summary-stats'],
    queryFn: async () => {
      // Get document counts by type
      const { data: docs } = await supabase
        .from('documents')
        .select('doc_type, raw_content');

      const { data: summaries } = await supabase
        .from('document_summaries')
        .select('document_id');

      const summarizedIds = new Set((summaries ?? []).map(s => s.document_id));

      const stats: Record<string, CorpusStats> = {};
      for (const doc of docs ?? []) {
        if (!stats[doc.doc_type]) {
          stats[doc.doc_type] = { doc_type: doc.doc_type, total: 0, has_content: 0, summarized: 0 };
        }
        stats[doc.doc_type].total++;
        if (doc.raw_content) stats[doc.doc_type].has_content++;
      }

      // Count summarized per type - need to join
      const { data: sumWithType } = await supabase
        .from('document_summaries')
        .select('document_id, documents(doc_type)')
        .limit(1000);

      for (const s of sumWithType ?? []) {
        const docType = (s as any).documents?.doc_type;
        if (docType && stats[docType]) {
          stats[docType].summarized++;
        }
      }

      return Object.values(stats).sort((a, b) => b.total - a.total);
    },
    refetchInterval: 15000,
  });
}

export function DocumentSummaryRunner() {
  const [mode, setMode] = useState<'batch' | 'single'>('batch');
  const [batchSize, setBatchSize] = useState(5);
  const [documentId, setDocumentId] = useState('');
  const [twoPass, setTwoPass] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [lastResponse, setLastResponse] = useState<Record<string, unknown> | null>(null);

  const { data: corpusStats = [], refetch: refetchStats } = useCorpusStats();

  const totalDocs = corpusStats.reduce((sum, s) => sum + s.has_content, 0);
  const totalSummarized = corpusStats.reduce((sum, s) => sum + s.summarized, 0);
  const progress = totalDocs > 0 ? Math.round((totalSummarized / totalDocs) * 100) : 0;

  const runSummary = async () => {
    setIsRunning(true);
    setResults([]);
    setLastResponse(null);

    try {
      const body: Record<string, unknown> = {};

      if (mode === 'single') {
        if (!documentId.trim()) {
          toast.error('Enter a document ID');
          setIsRunning(false);
          return;
        }
        body.mode = 'single';
        body.document_id = documentId.trim();
        body.two_pass = twoPass;
      } else {
        body.mode = 'batch';
        body.batch_size = batchSize;
      }

      const { data, error } = await supabase.functions.invoke('generate-document-summary', {
        body,
      });

      if (error) {
        toast.error(`Edge function error: ${error.message}`);
        setLastResponse({ error: error.message });
      } else {
        setLastResponse(data);
        if (data.results) {
          setResults(data.results);
        }
        const succeeded = data.succeeded ?? (data.success ? 1 : 0);
        const errors = data.errors ?? 0;
        toast.success(`Done: ${succeeded} succeeded, ${errors} errors`);
        refetchStats();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
      setLastResponse({ error: msg });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Document Summary Generator
            </CardTitle>
            <CardDescription>
              Generate AI summaries using the hybrid model strategy (gpt-4o for directives, gpt-4o-mini for rest)
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{totalSummarized} / {totalDocs}</div>
            <div className="text-sm text-muted-foreground">{progress}% summarized</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Corpus Stats */}
        <div className="grid grid-cols-5 gap-3">
          {corpusStats.map(s => (
            <div key={s.doc_type} className="rounded-lg border p-3 text-center">
              <div className="text-xs text-muted-foreground uppercase">{s.doc_type}</div>
              <div className="text-lg font-semibold">{s.summarized}/{s.has_content}</div>
              <div className="text-xs text-muted-foreground">
                {s.has_content > 0 ? Math.round((s.summarized / s.has_content) * 100) : 0}%
              </div>
            </div>
          ))}
        </div>

        {/* Controls */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'batch' | 'single')}>
          <TabsList>
            <TabsTrigger value="batch">Batch Mode</TabsTrigger>
            <TabsTrigger value="single">Single Document</TabsTrigger>
          </TabsList>

          <TabsContent value="batch" className="space-y-4 pt-4">
            <div className="flex items-end gap-4">
              <div className="space-y-2">
                <Label>Batch Size</Label>
                <Select value={String(batchSize)} onValueChange={v => setBatchSize(Number(v))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 docs</SelectItem>
                    <SelectItem value="5">5 docs</SelectItem>
                    <SelectItem value="10">10 docs</SelectItem>
                    <SelectItem value="20">20 docs</SelectItem>
                    <SelectItem value="50">50 docs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={runSummary} disabled={isRunning}>
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {isRunning ? 'Running…' : 'Run Batch'}
              </Button>
              <Button variant="outline" size="icon" onClick={() => refetchStats()} title="Refresh stats">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              ⚠️ Batch size &gt;5 may timeout (150s limit). Progress is saved even on timeout.
            </p>
          </TabsContent>

          <TabsContent value="single" className="space-y-4 pt-4">
            <div className="flex items-end gap-4">
              <div className="flex-1 space-y-2">
                <Label>Document ID</Label>
                <Input
                  placeholder="Enter document UUID"
                  value={documentId}
                  onChange={e => setDocumentId(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Switch id="two-pass" checked={twoPass} onCheckedChange={setTwoPass} />
                <Label htmlFor="two-pass">Two-pass</Label>
              </div>
              <Button onClick={runSummary} disabled={isRunning}>
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {isRunning ? 'Running…' : 'Summarize'}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Results</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doc Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Strategy</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-xs">{r.doc_number}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.doc_type}</Badge>
                    </TableCell>
                    <TableCell>
                      {r.status === 'success' ? (
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                      ) : (
                        <XCircle className="h-4 w-4 text-destructive" />
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{r.strategy ?? '—'}</TableCell>
                    <TableCell className="text-xs text-destructive max-w-[200px] truncate">{r.error ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Single doc response preview */}
        {lastResponse && mode === 'single' && !results.length && (
          <div className="space-y-2">
            <h4 className="font-medium">Response</h4>
            <pre className="rounded-lg bg-muted p-4 text-xs overflow-auto max-h-96">
              {JSON.stringify(lastResponse, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
