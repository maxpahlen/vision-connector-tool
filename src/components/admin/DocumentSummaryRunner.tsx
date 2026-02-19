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
import { Brain, Play, Loader2, CheckCircle2, XCircle, RefreshCw, Sparkles, Network } from 'lucide-react';
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
      const queries = DOC_TYPES.flatMap(type => [
        supabase.from('documents').select('*', { count: 'exact', head: true }).eq('doc_type', type),
        supabase.from('documents').select('*', { count: 'exact', head: true }).eq('doc_type', type).not('raw_content', 'is', null).neq('raw_content', ''),
        supabase.from('document_summaries').select('*, documents!inner(doc_type)', { count: 'exact', head: true }).eq('documents.doc_type', type),
      ]);

      const results = await Promise.all(queries);

      return DOC_TYPES.map((type, i) => ({
        doc_type: type,
        total: results[i * 3].count ?? 0,
        has_content: results[i * 3 + 1].count ?? 0,
        summarized: results[i * 3 + 2].count ?? 0,
      })).sort((a, b) => b.total - a.total);
    },
    refetchInterval: 15000,
  });
}

const DOC_TYPES = ['sou', 'proposition', 'committee_report', 'directive', 'law'] as const;

export function DocumentSummaryRunner() {
  const [mode, setMode] = useState<'batch' | 'single'>('batch');
  const [batchSize, setBatchSize] = useState(5);
  const [batchCount, setBatchCount] = useState(1);
  const [docTypeFilter, setDocTypeFilter] = useState<string>('mixed');
  const [documentId, setDocumentId] = useState('');
  const [twoPass, setTwoPass] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [lastResponse, setLastResponse] = useState<Record<string, unknown> | null>(null);
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [embeddingResult, setEmbeddingResult] = useState<Record<string, unknown> | null>(null);
  const [isComputing, setIsComputing] = useState(false);
  const [cooccurrenceResult, setCooccurrenceResult] = useState<Record<string, unknown> | null>(null);

  const { data: corpusStats = [], refetch: refetchStats } = useCorpusStats();

  const { data: embeddingStats } = useQuery({
    queryKey: ['embedding-stats'],
    queryFn: async () => {
      const [totalRes, embeddedRes] = await Promise.all([
        supabase.from('document_summaries').select('*', { count: 'exact', head: true }).not('summary_text', 'is', null),
        supabase.from('document_summaries').select('*', { count: 'exact', head: true }).not('embedding', 'is', null),
      ]);
      return { total: totalRes.count ?? 0, embedded: embeddedRes.count ?? 0 };
    },
    refetchInterval: 15000,
  });

  const totalDocs = corpusStats.reduce((sum, s) => sum + s.has_content, 0);
  const totalSummarized = corpusStats.reduce((sum, s) => sum + s.summarized, 0);
  const progress = totalDocs > 0 ? Math.round((totalSummarized / totalDocs) * 100) : 0;

  const runEmbeddings = async () => {
    setIsEmbedding(true);
    setEmbeddingResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('generate-embeddings', {
        body: { batch_size: 20 },
      });
      if (error) {
        toast.error(`Embedding error: ${error.message}`);
        setEmbeddingResult({ error: error.message });
      } else {
        setEmbeddingResult(data);
        if (data.processed === 0) {
          toast.success('All summaries already have embeddings');
        } else {
          toast.success(`Embedded ${data.succeeded}/${data.processed} summaries`);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
      setEmbeddingResult({ error: msg });
    } finally {
      setIsEmbedding(false);
    }
  };

  const runSummary = async () => {
    setIsRunning(true);
    setResults([]);
    setLastResponse(null);
    setCurrentBatch(0);

    try {
      if (mode === 'single') {
        if (!documentId.trim()) {
          toast.error('Enter a document ID');
          setIsRunning(false);
          return;
        }
        const { data, error } = await supabase.functions.invoke('generate-document-summary', {
          body: { mode: 'single', document_id: documentId.trim(), two_pass: twoPass },
        });
        if (error) {
          toast.error(`Error: ${error.message}`);
          setLastResponse({ error: error.message });
        } else {
          setLastResponse(data);
          toast.success('Summary generated');
          refetchStats();
        }
      } else {
        const allResults: BatchResult[] = [];
        for (let i = 0; i < batchCount; i++) {
          setCurrentBatch(i + 1);
          const body: Record<string, unknown> = {
            mode: 'batch',
            batch_size: batchSize,
          };
          if (docTypeFilter !== 'mixed') {
            body.doc_type = docTypeFilter;
          }

          const { data, error } = await supabase.functions.invoke('generate-document-summary', { body });

          if (error) {
            toast.error(`Batch ${i + 1} error: ${error.message}`);
            break;
          }

          if (data.results) {
            allResults.push(...data.results);
            setResults([...allResults]);
          }

          const succeeded = data.succeeded ?? 0;
          const noMore = data.processed === 0;
          toast.info(`Batch ${i + 1}/${batchCount}: ${succeeded} succeeded`);

          if (noMore) {
            toast.success('No more documents to summarize');
            break;
          }

          refetchStats();
        }
        setLastResponse({ total_batches: batchCount, total_results: allResults.length });
        refetchStats();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
      setLastResponse({ error: msg });
    } finally {
      setIsRunning(false);
      setCurrentBatch(0);
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

        {/* Embedding Controls */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span className="font-medium">Embeddings</span>
              {embeddingStats && (
                <Badge variant={embeddingStats.embedded === embeddingStats.total ? 'default' : 'secondary'}>
                  {embeddingStats.embedded}/{embeddingStats.total} embedded
                </Badge>
              )}
            </div>
            <Button onClick={runEmbeddings} disabled={isEmbedding} size="sm" variant="outline">
              {isEmbedding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {isEmbedding ? 'Embedding…' : 'Generate Embeddings'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Generates 1024-dim vectors (multilingual-e5-large) for summaries missing embeddings. Batch of 20 per click.
          </p>
          {embeddingResult && (
            <pre className="rounded bg-muted p-2 text-xs overflow-auto max-h-32">
              {JSON.stringify(embeddingResult, null, 2)}
            </pre>
          )}
        </div>

        {/* Co-Occurrence Compute */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4" />
              <span className="font-medium">Entity Co-Occurrence</span>
            </div>
            <Button
              onClick={async () => {
                setIsComputing(true);
                setCooccurrenceResult(null);
                try {
                  const { data, error } = await supabase.functions.invoke('compute-entity-cooccurrence', {
                    body: {},
                  });
                  if (error) {
                    toast.error(`Co-occurrence error: ${error.message}`);
                    setCooccurrenceResult({ error: error.message });
                  } else {
                    setCooccurrenceResult(data);
                    toast.success(`Computed ${data.inserted ?? data.stats?.total_pairs ?? 0} pairs`);
                  }
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  toast.error(msg);
                  setCooccurrenceResult({ error: msg });
                } finally {
                  setIsComputing(false);
                }
              }}
              disabled={isComputing}
              size="sm"
              variant="outline"
            >
              {isComputing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />}
              {isComputing ? 'Computing…' : 'Compute Co-Occurrence'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Full recompute of entity pair co-occurrence from remiss invitees and responses. Calculates Jaccard scores.
          </p>
          {cooccurrenceResult && (
            <pre className="rounded bg-muted p-2 text-xs overflow-auto max-h-32">
              {JSON.stringify(cooccurrenceResult, null, 2)}
            </pre>
          )}
        </div>

        {/* Controls */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'batch' | 'single')}>
          <TabsList>
            <TabsTrigger value="batch">Batch Mode</TabsTrigger>
            <TabsTrigger value="single">Single Document</TabsTrigger>
          </TabsList>

          <TabsContent value="batch" className="space-y-4 pt-4">
            <div className="flex items-end gap-4 flex-wrap">
              <div className="space-y-2">
                <Label>Batch Size</Label>
                <Select value={String(batchSize)} onValueChange={v => setBatchSize(Number(v))}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 docs</SelectItem>
                    <SelectItem value="5">5 docs</SelectItem>
                    <SelectItem value="10">10 docs</SelectItem>
                    <SelectItem value="20">20 docs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Batches</Label>
                <Select value={String(batchCount)} onValueChange={v => setBatchCount(Number(v))}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1×</SelectItem>
                    <SelectItem value="3">3×</SelectItem>
                    <SelectItem value="5">5×</SelectItem>
                    <SelectItem value="10">10×</SelectItem>
                    <SelectItem value="20">20×</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Doc Type</Label>
                <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mixed">Mixed (all types)</SelectItem>
                    {DOC_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={runSummary} disabled={isRunning}>
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {isRunning ? `Batch ${currentBatch}/${batchCount}…` : `Run ${batchCount}× ${batchSize} docs`}
              </Button>
              <Button variant="outline" size="icon" onClick={() => refetchStats()} title="Refresh stats">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Total: {batchSize * batchCount} docs across {batchCount} sequential calls. Progress saved even on timeout.
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
