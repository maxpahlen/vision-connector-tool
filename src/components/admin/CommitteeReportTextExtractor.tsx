import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Play, Square, RefreshCw, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface ExtractionStats {
  total: number;
  extracted: number;
  pending: number;
  errors: number;
}

interface ExtractionResult {
  processed: number;
  extracted: number;
  skipped: number;
  errors: Array<{ document_id: string; doc_number: string; error: string }>;
  details: Array<{
    document_id: string;
    doc_number: string;
    title: string;
    text_length: number;
    page_count?: number;
    extraction_status: string;
  }>;
  message?: string;
}

export default function CommitteeReportTextExtractor() {
  const [stats, setStats] = useState<ExtractionStats>({ total: 0, extracted: 0, pending: 0, errors: 0 });
  const [isLoading, setIsLoading] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [shouldStop, setShouldStop] = useState(false);
  const [batchSize, setBatchSize] = useState(10);
  const [batchCount, setBatchCount] = useState(5);
  const [dryRun, setDryRun] = useState(false);
  const [lastResult, setLastResult] = useState<ExtractionResult | null>(null);
  const [processedTotal, setProcessedTotal] = useState(0);

  const fetchStats = async () => {
    setIsLoading(true);
    try {
      // Get total committee reports with PDFs
      const { count: total } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('doc_type', 'committee_report')
        .not('pdf_url', 'is', null);

      // Get extracted (has raw_content)
      const { count: extracted } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('doc_type', 'committee_report')
        .not('pdf_url', 'is', null)
        .not('raw_content', 'is', null);

      // Get errors (metadata contains extraction_status = 'error')
      const { data: errorDocs } = await supabase
        .from('documents')
        .select('id')
        .eq('doc_type', 'committee_report')
        .eq('metadata->>extraction_status', 'error');

      const errors = errorDocs?.length || 0;
      const pending = (total || 0) - (extracted || 0) - errors;

      setStats({
        total: total || 0,
        extracted: extracted || 0,
        pending,
        errors
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
      toast.error('Failed to fetch extraction stats');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const runExtraction = async () => {
    setIsRunning(true);
    setShouldStop(false);
    setProcessedTotal(0);
    setLastResult(null);

    try {
      for (let batch = 0; batch < batchCount; batch++) {
        if (shouldStop) {
          toast.info(`Stopped after ${batch} batches`);
          break;
        }

        console.log(`[CommitteeReportTextExtractor] Running batch ${batch + 1}/${batchCount}`);

        const { data, error } = await supabase.functions.invoke('process-committee-report-pdf', {
          body: { limit: batchSize, dry_run: dryRun }
        });

        if (error) {
          console.error('Extraction error:', error);
          toast.error(`Batch ${batch + 1} failed: ${error.message}`);
          break;
        }

        const result = data as ExtractionResult;
        setLastResult(result);
        setProcessedTotal(prev => prev + result.processed);

        if (result.message === 'No committee report PDFs to process') {
          toast.success('All committee reports have been processed!');
          break;
        }

        toast.success(`Batch ${batch + 1}: Extracted ${result.extracted}, Errors: ${result.errors.length}`);

        // Refresh stats after each batch
        await fetchStats();

        // Wait 2 seconds between batches to allow function cooldown
        if (batch < batchCount - 1 && !shouldStop) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      console.error('Extraction error:', error);
      toast.error(`Extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRunning(false);
      await fetchStats();
    }
  };

  const stopExtraction = () => {
    setShouldStop(true);
    toast.info('Stopping after current batch completes...');
  };

  const progressPercent = stats.total > 0 
    ? Math.round(((stats.extracted + stats.errors) / stats.total) * 100) 
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Committee Report Text Extraction
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-muted rounded-lg">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total Reports</div>
          </div>
          <div className="text-center p-4 bg-green-500/10 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{stats.extracted}</div>
            <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
              <CheckCircle className="h-3 w-3" /> Extracted
            </div>
          </div>
          <div className="text-center p-4 bg-yellow-500/10 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
            <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
              <AlertCircle className="h-3 w-3" /> Pending
            </div>
          </div>
          <div className="text-center p-4 bg-red-500/10 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{stats.errors}</div>
            <div className="text-sm text-muted-foreground flex items-center justify-center gap-1">
              <XCircle className="h-3 w-3" /> Errors
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Extraction Progress</span>
            <span>{progressPercent}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {/* Controls */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="batchSize">Batch Size</Label>
            <Input
              id="batchSize"
              type="number"
              min={1}
              max={50}
              value={batchSize}
              onChange={(e) => setBatchSize(parseInt(e.target.value) || 10)}
              disabled={isRunning}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="batchCount">Batch Count</Label>
            <Input
              id="batchCount"
              type="number"
              min={1}
              max={100}
              value={batchCount}
              onChange={(e) => setBatchCount(parseInt(e.target.value) || 5)}
              disabled={isRunning}
            />
          </div>
          <div className="flex items-end space-x-2">
            <div className="flex items-center space-x-2">
              <Switch
                id="dryRun"
                checked={dryRun}
                onCheckedChange={setDryRun}
                disabled={isRunning}
              />
              <Label htmlFor="dryRun">Dry Run</Label>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <Button
              onClick={fetchStats}
              variant="outline"
              size="icon"
              disabled={isLoading || isRunning}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            {isRunning ? (
              <Button onClick={stopExtraction} variant="destructive" className="flex-1">
                <Square className="h-4 w-4 mr-2" /> Stop
              </Button>
            ) : (
              <Button onClick={runExtraction} disabled={stats.pending === 0} className="flex-1">
                <Play className="h-4 w-4 mr-2" /> Run Extraction
              </Button>
            )}
          </div>
        </div>

        {/* Running Status */}
        {isRunning && (
          <div className="p-4 bg-blue-500/10 rounded-lg">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
              <span className="font-medium">Processing...</span>
              <span className="text-muted-foreground">
                Processed {processedTotal} documents so far
              </span>
            </div>
          </div>
        )}

        {/* Last Result */}
        {lastResult && (
          <div className="space-y-4">
            <h4 className="font-medium">Last Batch Result</h4>
            <div className="flex gap-2">
              <Badge variant="outline">Processed: {lastResult.processed}</Badge>
              <Badge variant="secondary" className="bg-green-500/10">
                Extracted: {lastResult.extracted}
              </Badge>
              <Badge variant="secondary" className="bg-yellow-500/10">
                Skipped: {lastResult.skipped}
              </Badge>
              <Badge variant="secondary" className="bg-red-500/10">
                Errors: {lastResult.errors.length}
              </Badge>
            </div>

            {/* Details */}
            {lastResult.details.length > 0 && (
              <div className="max-h-60 overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2">Doc Number</th>
                      <th className="text-left p-2">Title</th>
                      <th className="text-right p-2">Chars</th>
                      <th className="text-right p-2">Pages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastResult.details.map((detail) => (
                      <tr key={detail.document_id} className="border-t">
                        <td className="p-2 font-mono text-xs">{detail.doc_number}</td>
                        <td className="p-2 truncate max-w-[200px]">{detail.title}</td>
                        <td className="p-2 text-right">{detail.text_length.toLocaleString()}</td>
                        <td className="p-2 text-right">{detail.page_count || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Errors */}
            {lastResult.errors.length > 0 && (
              <div className="space-y-2">
                <h5 className="text-sm font-medium text-red-600">Errors</h5>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {lastResult.errors.map((err, idx) => (
                    <div key={idx} className="text-xs p-2 bg-red-500/10 rounded">
                      <span className="font-mono">{err.doc_number}</span>: {err.error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
