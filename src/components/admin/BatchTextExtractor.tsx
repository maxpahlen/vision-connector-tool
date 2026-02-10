import { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, FileText, CheckCircle2, XCircle, Play, Square, RefreshCw } from 'lucide-react';

interface PipelineCounts {
  directive: number;
  proposition: number;
  committee_report: number;
}

interface BatchResult {
  pipeline: string;
  batch: number;
  extracted: number;
  errors: number;
  details: string[];
}

const PIPELINES = [
  { key: 'directive', label: 'Directives (Riksdagen text)', fn: 'process-directive-text', batchSize: 10 },
  { key: 'proposition', label: 'Propositions (PDF)', fn: 'process-proposition-pdf', batchSize: 20 },
  { key: 'committee_report', label: 'Committee Reports (PDF)', fn: 'process-committee-report-pdf', batchSize: 10 },
] as const;

const DELAY_BETWEEN_BATCHES_MS = 2500;

export function BatchTextExtractor() {
  const [counts, setCounts] = useState<PipelineCounts | null>(null);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [currentPipeline, setCurrentPipeline] = useState<string | null>(null);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalExtracted, setTotalExtracted] = useState(0);
  const [totalErrors, setTotalErrors] = useState(0);
  const [results, setResults] = useState<BatchResult[]>([]);
  const stopRef = useRef(false);

  const loadCounts = useCallback(async () => {
    setLoading(true);
    try {
      // Query missing raw_content by doc_type in parallel
      const [dirRes, propRes, crRes] = await Promise.all([
        supabase
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .eq('doc_type', 'directive')
          .is('raw_content', null),
        supabase
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .eq('doc_type', 'proposition')
          .is('raw_content', null)
          .not('pdf_url', 'is', null),
        supabase
          .from('documents')
          .select('id', { count: 'exact', head: true })
          .eq('doc_type', 'committee_report')
          .is('raw_content', null)
          .not('pdf_url', 'is', null),
      ]);

      const newCounts: PipelineCounts = {
        directive: dirRes.count ?? 0,
        proposition: propRes.count ?? 0,
        committee_report: crRes.count ?? 0,
      };
      setCounts(newCounts);
      const total = newCounts.directive + newCounts.proposition + newCounts.committee_report;
      toast.success(`Found ${total} documents needing text extraction`);
    } catch (err) {
      console.error('[BatchExtract] Error loading counts:', err);
      toast.error('Failed to load counts');
    } finally {
      setLoading(false);
    }
  }, []);

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

  const runPipeline = async (pipeline: typeof PIPELINES[number], remaining: number) => {
    let batch = 0;
    let left = remaining;

    while (left > 0 && !stopRef.current) {
      batch++;
      setCurrentBatch(batch);

      const { data, error } = await supabase.functions.invoke(pipeline.fn, {
        body: { limit: pipeline.batchSize, dry_run: false },
      });

      if (error) {
        console.error(`[BatchExtract] ${pipeline.key} batch ${batch} error:`, error);
        setResults(prev => [...prev, {
          pipeline: pipeline.label,
          batch,
          extracted: 0,
          errors: 1,
          details: [error.message],
        }]);
        setTotalErrors(prev => prev + 1);
        break;
      }

      const extracted = data?.extracted ?? data?.results?.filter((r: { success: boolean }) => r.success)?.length ?? 0;
      const errors = data?.errors?.length ?? 0;
      const errorDetails = (data?.errors ?? []).map((e: { doc_number: string; error: string }) => `${e.doc_number}: ${e.error}`);

      setTotalExtracted(prev => prev + extracted);
      setTotalErrors(prev => prev + errors);
      setResults(prev => [...prev, {
        pipeline: pipeline.label,
        batch,
        extracted,
        errors,
        details: errorDetails,
      }]);

      left -= pipeline.batchSize;

      if (left > 0 && !stopRef.current) {
        await delay(DELAY_BETWEEN_BATCHES_MS);
      }
    }
  };

  const runAll = async () => {
    if (!counts) return;
    stopRef.current = false;
    setRunning(true);
    setResults([]);
    setTotalExtracted(0);
    setTotalErrors(0);

    for (const pipeline of PIPELINES) {
      const remaining = counts[pipeline.key as keyof PipelineCounts];
      if (remaining === 0 || stopRef.current) continue;

      setCurrentPipeline(pipeline.label);
      setCurrentBatch(0);
      await runPipeline(pipeline, remaining);
    }

    setCurrentPipeline(null);
    setRunning(false);
    toast.success('Batch extraction complete — refreshing counts');
    await loadCounts();
  };

  const runSingle = async (pipeline: typeof PIPELINES[number]) => {
    if (!counts) return;
    const remaining = counts[pipeline.key as keyof PipelineCounts];
    if (remaining === 0) {
      toast.info(`No ${pipeline.label} need extraction`);
      return;
    }
    stopRef.current = false;
    setRunning(true);
    setResults([]);
    setTotalExtracted(0);
    setTotalErrors(0);
    setCurrentPipeline(pipeline.label);
    setCurrentBatch(0);

    await runPipeline(pipeline, remaining);

    setCurrentPipeline(null);
    setRunning(false);
    toast.success(`${pipeline.label} extraction complete — refreshing counts`);
    await loadCounts();
  };

  const handleStop = () => {
    stopRef.current = true;
    toast.info('Stopping after current batch completes…');
  };

  const totalNeeding = counts ? counts.directive + counts.proposition + counts.committee_report : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Batch Text Extraction
        </CardTitle>
        <CardDescription>
          Extract text from all document types missing raw_content. Directives use Riksdagen text API; Propositions and Committee Reports use PDF extraction.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scan button */}
        <Button onClick={loadCounts} disabled={loading || running} variant="outline">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <RefreshCw className="mr-2 h-4 w-4" />
          Scan for Missing Content
        </Button>

        {/* Counts display */}
        {counts && (
          <div className="flex flex-wrap gap-2">
            <Badge variant={totalNeeding > 0 ? 'destructive' : 'default'}>
              Total Missing: {totalNeeding}
            </Badge>
            {PIPELINES.map(p => {
              const c = counts[p.key as keyof PipelineCounts];
              return (
                <Badge key={p.key} variant={c > 0 ? 'outline' : 'secondary'}>
                  {p.label}: {c}
                </Badge>
              );
            })}
          </div>
        )}

        {/* Action buttons */}
        {counts && totalNeeding > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={runAll} disabled={running}>
              {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Play className="mr-2 h-4 w-4" />
              Extract All ({totalNeeding})
            </Button>
            {PIPELINES.map(p => {
              const c = counts[p.key as keyof PipelineCounts];
              if (c === 0) return null;
              return (
                <Button key={p.key} variant="outline" onClick={() => runSingle(p)} disabled={running} size="sm">
                  {p.label} ({c})
                </Button>
              );
            })}
            {running && (
              <Button variant="destructive" onClick={handleStop} size="sm">
                <Square className="mr-2 h-4 w-4" />
                Stop
              </Button>
            )}
          </div>
        )}

        {counts && totalNeeding === 0 && (
          <div className="text-sm text-muted-foreground p-4 border rounded-lg bg-muted/50">
            ✅ All documents have text content extracted. Nothing to do.
          </div>
        )}

        {/* Progress */}
        {running && currentPipeline && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="font-medium">{currentPipeline}</span>
              <span className="text-muted-foreground">— Batch {currentBatch}</span>
            </div>
            <Progress value={totalNeeding > 0 ? ((totalExtracted + totalErrors) / totalNeeding) * 100 : 0} />
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span>Extracted: {totalExtracted}</span>
              <span>Errors: {totalErrors}</span>
            </div>
          </div>
        )}

        {/* Results log */}
        {results.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Results</h4>
            <div className="rounded-lg border p-3 space-y-1 max-h-60 overflow-auto text-xs">
              {results.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  {r.errors === 0 ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                  )}
                  <Badge variant="outline" className="text-[10px]">{r.pipeline}</Badge>
                  <span>Batch {r.batch}: {r.extracted} extracted, {r.errors} errors</span>
                  {r.details.length > 0 && (
                    <span className="text-destructive ml-2">— {r.details.join('; ')}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
