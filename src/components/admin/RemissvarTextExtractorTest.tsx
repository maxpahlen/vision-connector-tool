import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, FileText, CheckCircle2, XCircle, RefreshCw, Play, BarChart3 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface ExtractionStats {
  total: number;
  not_started: number;
  ok: number;
  error: number;
  skipped: number;
  pending: number;
}

interface ExtractionResult {
  response_id: string;
  filename: string | null;
  text_length: number;
  page_count?: number;
  extraction_status: string;
}

interface BatchResult {
  processed: number;
  extracted: number;
  skipped: number;
  errors: Array<{ response_id: string; error: string }>;
  details: ExtractionResult[];
}

export function RemissvarTextExtractorTest() {
  const [stats, setStats] = useState<ExtractionStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [batchSize, setBatchSize] = useState('10');
  const [dryRun, setDryRun] = useState(false);
  const [lastResult, setLastResult] = useState<BatchResult | null>(null);
  const [totalProcessed, setTotalProcessed] = useState(0);

  // Load extraction stats
  const loadStats = async () => {
    setLoading(true);
    try {
      // Get counts by extraction_status
      const { data, error } = await supabase
        .from('remiss_responses')
        .select('extraction_status')
        .eq('file_type', 'pdf')
        .not('file_url', 'is', null);

      if (error) throw error;

      const counts: ExtractionStats = {
        total: data?.length || 0,
        not_started: 0,
        ok: 0,
        error: 0,
        skipped: 0,
        pending: 0,
      };

      data?.forEach(row => {
        const status = row.extraction_status || 'not_started';
        if (status in counts) {
          counts[status as keyof Omit<ExtractionStats, 'total'>]++;
        }
      });

      setStats(counts);
      console.log('[Remissvar Extraction] Stats loaded:', counts);
    } catch (err) {
      console.error('[Remissvar Extraction] Error loading stats:', err);
      toast.error('Failed to load extraction stats');
    } finally {
      setLoading(false);
    }
  };

  // Run batch extraction
  const runBatchExtraction = async () => {
    setExtracting(true);
    setLastResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('process-remissvar-pdf', {
        body: {
          limit: parseInt(batchSize, 10),
          dry_run: dryRun,
        }
      });

      if (error) throw error;

      setLastResult(data);
      setTotalProcessed(prev => prev + (data?.processed || 0));

      if (data?.processed > 0) {
        toast.success(`Extracted ${data.extracted}/${data.processed} PDFs${dryRun ? ' (dry run)' : ''}`);
      } else {
        toast.info(data?.message || 'No PDFs to process');
      }

      // Refresh stats after extraction
      if (!dryRun) {
        await loadStats();
      }
    } catch (err) {
      console.error('[Remissvar Extraction] Error:', err);
      toast.error('Extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  // Load stats on mount
  useEffect(() => {
    loadStats();
  }, []);

  const progressPercentage = stats && stats.total > 0
    ? Math.round(((stats.ok + stats.error + stats.skipped) / stats.total) * 100)
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Remissvar PDF Text Extraction
        </CardTitle>
        <CardDescription>
          Extract text from remissvar PDF files using the process-remissvar-pdf edge function
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats section */}
        <div className="flex items-center gap-4">
          <Button onClick={loadStats} disabled={loading} variant="outline" size="sm">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Stats
          </Button>
        </div>

        {/* Progress overview */}
        {stats && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Extraction Progress
              </span>
              <span className="text-muted-foreground">
                {progressPercentage}% complete
              </span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
            
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                Total PDFs: {stats.total.toLocaleString()}
              </Badge>
              <Badge variant="secondary">
                Pending: {stats.not_started.toLocaleString()}
              </Badge>
              <Badge variant="default">
                Extracted: {stats.ok.toLocaleString()}
              </Badge>
              {stats.error > 0 && (
                <Badge variant="destructive">
                  Errors: {stats.error.toLocaleString()}
                </Badge>
              )}
              {stats.skipped > 0 && (
                <Badge variant="outline">
                  Skipped: {stats.skipped.toLocaleString()}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Batch controls */}
        <div className="flex items-center gap-4 pt-2 border-t">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Batch size:</span>
            <Select value={batchSize} onValueChange={setBatchSize}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={runBatchExtraction}
            disabled={extracting || (stats?.not_started === 0)}
            variant={dryRun ? 'outline' : 'default'}
          >
            {extracting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Play className="mr-2 h-4 w-4" />
            {dryRun ? 'Dry Run' : 'Extract Batch'}
          </Button>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="rounded"
            />
            Dry run (no writes)
          </label>

          {totalProcessed > 0 && (
            <span className="text-sm text-muted-foreground">
              Session total: {totalProcessed} processed
            </span>
          )}
        </div>

        {/* Last batch results */}
        {lastResult && (
          <div className="space-y-2 pt-2 border-t">
            <h4 className="font-medium text-sm flex items-center gap-2">
              Last Batch Results
              {dryRun && <Badge variant="outline" className="text-xs">DRY RUN</Badge>}
            </h4>
            
            <div className="flex gap-4 text-sm">
              <span>Processed: {lastResult.processed}</span>
              <span className="text-primary">Extracted: {lastResult.extracted}</span>
              <span>Skipped: {lastResult.skipped}</span>
              {lastResult.errors.length > 0 && (
                <span className="text-destructive">Errors: {lastResult.errors.length}</span>
              )}
            </div>

            {/* Successful extractions */}
            {lastResult.details.length > 0 && (
              <div className="rounded-lg border max-h-48 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="border-b bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Status</th>
                      <th className="p-2 text-left">Filename</th>
                      <th className="p-2 text-right">Text Length</th>
                      <th className="p-2 text-right">Pages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastResult.details.map((detail) => (
                      <tr key={detail.response_id} className="border-b">
                        <td className="p-2">
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        </td>
                        <td className="p-2 font-mono truncate max-w-xs" title={detail.filename || undefined}>
                          {detail.filename || 'unnamed'}
                        </td>
                        <td className="p-2 text-right text-muted-foreground">
                          {detail.text_length.toLocaleString()}
                        </td>
                        <td className="p-2 text-right text-muted-foreground">
                          {detail.page_count || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Errors */}
            {lastResult.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/50 p-3 space-y-1 max-h-32 overflow-auto">
                <h5 className="text-xs font-medium text-destructive">Errors</h5>
                {lastResult.errors.map((err, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <XCircle className="h-3 w-3 text-destructive flex-shrink-0" />
                    <span className="font-mono">{err.response_id.substring(0, 8)}...</span>
                    <span className="text-muted-foreground">{err.error}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* No pending message */}
        {stats?.not_started === 0 && stats.total > 0 && (
          <div className="text-sm text-muted-foreground p-4 border rounded-lg bg-muted/50 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            All remissvar PDFs have been processed!
          </div>
        )}
      </CardContent>
    </Card>
  );
}
