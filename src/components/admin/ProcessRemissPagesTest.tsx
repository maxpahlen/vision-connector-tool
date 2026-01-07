import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { Play, RefreshCw, CheckCircle, XCircle, AlertCircle, FileText } from 'lucide-react';

interface ProcessResult {
  remiss_id: string;
  remiss_url: string;
  status: 'scraped' | 'failed' | 'skipped';
  remissvar_count?: number;
  error?: string;
}

interface ProcessResponse {
  success: boolean;
  summary: {
    total: number;
    scraped: number;
    failed: number;
    skipped: number;
    total_remissvar_inserted: number;
    dry_run: boolean;
  };
  results: ProcessResult[];
  message?: string;
  error?: string;
}

export function ProcessRemissPagesTest() {
  const [limit, setLimit] = useState(5);
  const [remissId, setRemissId] = useState('');
  const [retryFailed, setRetryFailed] = useState(false);
  const [reprocessScraped, setReprocessScraped] = useState(false);
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ProcessResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch counts for display
  const [counts, setCounts] = useState<{
    discovered: number;
    scraped: number;
    failed: number;
  } | null>(null);

  const fetchCounts = async () => {
    const [discovered, scraped, failed] = await Promise.all([
      supabase.from('remiss_documents').select('*', { count: 'exact', head: true }).eq('status', 'discovered'),
      supabase.from('remiss_documents').select('*', { count: 'exact', head: true }).eq('status', 'scraped'),
      supabase.from('remiss_documents').select('*', { count: 'exact', head: true }).eq('status', 'failed'),
    ]);
    setCounts({
      discovered: discovered.count || 0,
      scraped: scraped.count || 0,
      failed: failed.count || 0,
    });
  };

  const runProcess = async () => {
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke('process-remiss-pages', {
        body: {
          limit,
          remiss_id: remissId || undefined,
          retry_failed: retryFailed,
          reprocess_scraped: reprocessScraped,
          dry_run: dryRun,
        },
      });

      if (fnError) throw fnError;
      setResponse(data as ProcessResponse);
      await fetchCounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  // Fetch counts on mount
  useState(() => {
    fetchCounts();
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Phase 2.5: Process Remiss Pages
        </CardTitle>
        <CardDescription>
          Fetch discovered remiss pages to extract deadlines, remissinstanser, and remissvar links.
          Updates status from 'discovered' → 'scraped' (or 'failed').
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status Counts */}
        {counts && (
          <div className="flex gap-4 text-sm">
            <Badge variant="outline" className="gap-1">
              <AlertCircle className="h-3 w-3 text-yellow-500" />
              Discovered: {counts.discovered}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              Scraped: {counts.scraped}
            </Badge>
            <Badge variant="outline" className="gap-1">
              <XCircle className="h-3 w-3 text-red-500" />
              Failed: {counts.failed}
            </Badge>
          </div>
        )}

        {/* Controls */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="limit">Batch Size</Label>
            <Input
              id="limit"
              type="number"
              min={1}
              max={50}
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value) || 5)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="remissId">Specific Remiss ID (optional)</Label>
            <Input
              id="remissId"
              placeholder="uuid..."
              value={remissId}
              onChange={(e) => setRemissId(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Switch
              id="dryRun"
              checked={dryRun}
              onCheckedChange={setDryRun}
            />
            <Label htmlFor="dryRun">Dry Run (no DB writes)</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="retryFailed"
              checked={retryFailed}
              onCheckedChange={(checked) => {
                setRetryFailed(checked);
                if (checked) setReprocessScraped(false);
              }}
            />
            <Label htmlFor="retryFailed">Retry Failed</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="reprocessScraped"
              checked={reprocessScraped}
              onCheckedChange={(checked) => {
                setReprocessScraped(checked);
                if (checked) setRetryFailed(false);
              }}
            />
            <Label htmlFor="reprocessScraped">Reprocess Scraped (re-scrape with improved parser)</Label>
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={runProcess} disabled={loading}>
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                {dryRun ? 'Test Run' : 'Process Pages'}
              </>
            )}
          </Button>
          <Button variant="outline" onClick={fetchCounts}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Counts
          </Button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive rounded-md text-sm">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Response Display */}
        {response && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="p-4 bg-muted rounded-md">
              <h4 className="font-medium mb-2">Summary</h4>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Total:</span> {response.summary.total}
                </div>
                <div>
                  <span className="text-green-600">Scraped:</span> {response.summary.scraped}
                </div>
                <div>
                  <span className="text-red-600">Failed:</span> {response.summary.failed}
                </div>
                <div>
                  <span className="text-muted-foreground">Remissvar Inserted:</span>{' '}
                  {response.summary.total_remissvar_inserted}
                </div>
                <div>
                  <span className="text-muted-foreground">Dry Run:</span>{' '}
                  {response.summary.dry_run ? 'Yes' : 'No'}
                </div>
              </div>
            </div>

            {/* Results Table */}
            {response.results.length > 0 && (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Remiss URL</th>
                      <th className="text-left p-2">Remissvar</th>
                      <th className="text-left p-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {response.results.map((result) => (
                      <tr key={result.remiss_id} className="border-t">
                        <td className="p-2">
                          {result.status === 'scraped' && (
                            <Badge variant="default" className="bg-green-600">Scraped</Badge>
                          )}
                          {result.status === 'failed' && (
                            <Badge variant="destructive">Failed</Badge>
                          )}
                          {result.status === 'skipped' && (
                            <Badge variant="secondary">Skipped</Badge>
                          )}
                        </td>
                        <td className="p-2 max-w-xs truncate">
                          <a
                            href={result.remiss_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            {result.remiss_url.split('/').slice(-1)[0]}
                          </a>
                        </td>
                        <td className="p-2">{result.remissvar_count ?? '-'}</td>
                        <td className="p-2 text-red-600 max-w-xs truncate">
                          {result.error || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
