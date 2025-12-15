import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Play, CheckCircle2, XCircle, AlertTriangle, Clock, PlayCircle, Zap, Search } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// Pre-selected test samples for Timeline Agent v2 validation
const TEST_SAMPLES = {
  directives: [
    { id: '03b2da22-070f-4522-8881-61f50a0055b2', doc_number: 'Dir. 2025:98', title: 'En ämnesutformad gymnasieskola', reason: 'Contains explicit decision date and deadline' },
    { id: '584a42b2-0409-4423-a653-1a28cc65c121', doc_number: 'Dir. 2025:97', title: 'Nationell samordnare för antisemitism', reason: 'Strategy document' },
    { id: '7359910f-1a6b-4535-ba72-ea101f9351df', doc_number: 'Dir. 2025:93', title: 'Nya utbildningsvägar specialpedagogik', reason: 'Education sector deadlines' },
    { id: '7c125389-d9ad-49ef-8940-2118e5645739', doc_number: 'Dir. 2025:86', title: 'Styrning av förvaltningsmyndigheter', reason: 'Long directive, crisis management' },
    { id: '8e98bc3b-56d1-4748-bf5c-7516b759ca94', doc_number: 'Dir. 2025:83', title: 'Regelverk för bakgrundskontroller', reason: 'Security topic' },
  ],
  sous: [
    { id: '8f9c286f-27d7-452f-9caa-cde229791b6a', doc_number: 'SOU 2025:103', title: 'En ny produktansvarslag', reason: 'Most recent SOU' },
    { id: '26d876f7-bd1e-400a-b381-183618c38468', doc_number: 'SOU 2025:79', title: 'Samlade förmågor cybersäkerhet', reason: 'Security/tech topic' },
    { id: '9dbbd113-6f8c-42f8-8686-3d9141ca5498', doc_number: 'SOU 2025:67', title: 'Arlanda flygplats', reason: 'Infrastructure' },
    { id: 'e84e3eb8-70a7-4678-8787-ba23b0c72f95', doc_number: 'SOU 2025:51', title: 'Förutsättningar klimatanpassning', reason: 'Policy/future planning' },
    { id: '7ac989a2-14b3-4377-be61-37a5865ef744', doc_number: 'SOU 2025:52', title: 'Ökad insyn politiska processer', reason: 'Largest content' },
  ],
};

interface EventMetadata {
  committee_event_kind?: string;
  role?: string;
  person_name?: string;
  deadline_kind?: string;
  deadline_index?: number;
  deadline_label?: string;
}

interface TestResult {
  document_id: string;
  doc_number: string;
  doc_type: string;
  status: 'pending' | 'running' | 'success' | 'skipped' | 'error';
  events_extracted?: number;
  events_inserted?: number;
  events_updated?: number;
  events?: Array<{
    event_type: string;
    event_date: string;
    confidence: string;
    metadata?: EventMetadata;
    action?: 'inserted' | 'updated';
  }>;
  error?: string;
  reason?: string;
  processing_time_ms?: number;
}

interface TestSummary {
  total: number;
  success: number;
  skipped: number;
  errors: number;
  total_inserted: number;
  total_updated: number;
  confidence_breakdown: {
    high: number;
    medium: number;
    low: number;
  };
  event_types: Record<string, number>;
}

export function TimelineAgentV2Test() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [running, setRunning] = useState(false);
  const [currentDoc, setCurrentDoc] = useState<string | null>(null);
  const [summary, setSummary] = useState<TestSummary | null>(null);
  const { toast } = useToast();
  
  // Batch task queue state
  const [docTypeFilter, setDocTypeFilter] = useState<string>("all");
  const [unprocessedCount, setUnprocessedCount] = useState<number>(0);
  const [processingBatch, setProcessingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ processed: number; total: number } | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);

  // Count documents that don't have timeline events yet
  const loadUnprocessedCount = async () => {
    setLoadingCount(true);
    try {
      // Get all process_ids that have timeline_events
      const { data: processedProcesses, error: eventsError } = await supabase
        .from("timeline_events")
        .select("process_id");

      if (eventsError) throw eventsError;

      const processedProcessIds = new Set(processedProcesses?.map(e => e.process_id) || []);

      // Build query based on filter
      let query = supabase
        .from("process_documents")
        .select("process_id, document_id, documents!inner(doc_type, raw_content)")
        .not("documents.raw_content", "is", null);

      if (docTypeFilter === "sou") {
        query = query.eq("documents.doc_type", "sou");
      } else if (docTypeFilter === "directive") {
        query = query.eq("documents.doc_type", "dir");
      }

      const { data: allProcessDocs, error: docsError } = await query;

      if (docsError) throw docsError;

      // Count unprocessed (unique process_ids)
      const unprocessedProcessIds = new Set<string>();
      for (const pd of allProcessDocs || []) {
        if (!processedProcessIds.has(pd.process_id)) {
          unprocessedProcessIds.add(pd.process_id);
        }
      }
      setUnprocessedCount(unprocessedProcessIds.size);
      
      toast({
        title: "Count Updated",
        description: `${unprocessedProcessIds.size} processes without timeline events`,
      });
    } catch (error) {
      console.error("Error counting unprocessed documents:", error);
      setUnprocessedCount(0);
    } finally {
      setLoadingCount(false);
    }
  };

  // Create batch tasks in the queue
  const processBatchDocuments = async (limit: number | null) => {
    setProcessingBatch(true);
    setBatchProgress(null);

    try {
      // Get all process_ids that have timeline_events
      const { data: processedProcesses, error: eventsError } = await supabase
        .from("timeline_events")
        .select("process_id");

      if (eventsError) throw eventsError;

      const processedProcessIds = new Set(processedProcesses?.map(e => e.process_id) || []);

      // Build query based on filter
      let query = supabase
        .from("process_documents")
        .select("process_id, document_id, documents!inner(doc_type, raw_content)")
        .not("documents.raw_content", "is", null);

      if (docTypeFilter === "sou") {
        query = query.eq("documents.doc_type", "sou");
      } else if (docTypeFilter === "directive") {
        query = query.eq("documents.doc_type", "dir");
      }

      const { data: allProcessDocs, error: docsError } = await query;

      if (docsError) throw docsError;

      // Filter to unprocessed only (unique by process_id)
      const unprocessedMap = new Map<string, { process_id: string; document_id: string }>();
      for (const pd of allProcessDocs || []) {
        if (!processedProcessIds.has(pd.process_id) && !unprocessedMap.has(pd.process_id)) {
          unprocessedMap.set(pd.process_id, { process_id: pd.process_id, document_id: pd.document_id });
        }
      }
      
      const unprocessedDocs = Array.from(unprocessedMap.values()).slice(0, limit || undefined);

      if (unprocessedDocs.length === 0) {
        toast({
          title: "No Documents to Process",
          description: "All documents with content already have timeline events extracted",
        });
        return;
      }

      const total = unprocessedDocs.length;
      setBatchProgress({ processed: 0, total });

      toast({
        title: "Batch Processing Started",
        description: `Creating tasks for ${total} documents...`,
      });

      // Create tasks for each document
      let tasksCreated = 0;
      for (const doc of unprocessedDocs) {
        // Check if task already exists
        const { data: existingTask } = await supabase
          .from("agent_tasks")
          .select("id")
          .eq("task_type", "timeline_extraction")
          .eq("document_id", doc.document_id)
          .eq("status", "pending")
          .maybeSingle();

        if (existingTask) {
          tasksCreated++;
          setBatchProgress({ processed: tasksCreated, total });
          continue;
        }

        // Create task
        const { error: taskError } = await supabase
          .from("agent_tasks")
          .insert({
            task_type: "timeline_extraction",
            agent_name: "agent-timeline-v2",
            status: "pending",
            priority: 5,
            document_id: doc.document_id,
            process_id: doc.process_id,
            input_data: {
              document_id: doc.document_id,
              process_id: doc.process_id,
            },
          });

        if (!taskError) {
          tasksCreated++;
          setBatchProgress({ processed: tasksCreated, total });
        }
      }

      toast({
        title: "Batch Tasks Created",
        description: `Created ${tasksCreated} timeline extraction tasks. Use Task Queue Monitor to process them.`,
      });

      // Refresh unprocessed count
      await loadUnprocessedCount();
    } catch (error) {
      console.error("Error processing batch:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process batch",
        variant: "destructive",
      });
    } finally {
      setProcessingBatch(false);
      setBatchProgress(null);
    }
  };

  const allSamples = [
    ...TEST_SAMPLES.directives.map(d => ({ ...d, doc_type: 'directive' })),
    ...TEST_SAMPLES.sous.map(d => ({ ...d, doc_type: 'sou' })),
  ];

  const runFullTestSuite = async () => {
    setRunning(true);
    setResults([]);
    setSummary(null);

    const testResults: TestResult[] = [];
    const summaryData: TestSummary = {
      total: allSamples.length,
      success: 0,
      skipped: 0,
      errors: 0,
      total_inserted: 0,
      total_updated: 0,
      confidence_breakdown: { high: 0, medium: 0, low: 0 },
      event_types: {},
    };

    for (const sample of allSamples) {
      setCurrentDoc(sample.doc_number);
      
      // Initialize result
      const result: TestResult = {
        document_id: sample.id,
        doc_number: sample.doc_number,
        doc_type: sample.doc_type,
        status: 'running',
      };
      
      setResults(prev => [...prev.filter(r => r.document_id !== sample.id), result]);

      try {
        // Get process_id for this document
        const { data: processDoc } = await supabase
          .from('process_documents')
          .select('process_id')
          .eq('document_id', sample.id)
          .single();

        if (!processDoc) {
          result.status = 'error';
          result.error = 'No process found for document';
          summaryData.errors++;
          testResults.push(result);
          setResults(prev => [...prev.filter(r => r.document_id !== sample.id), result]);
          continue;
        }

        console.log(`[Timeline v2 Test] Running on ${sample.doc_number}`, {
          document_id: sample.id,
          process_id: processDoc.process_id,
        });

        const { data, error } = await supabase.functions.invoke('agent-timeline-v2', {
          body: {
            document_id: sample.id,
            process_id: processDoc.process_id,
          },
        });

        if (error) throw error;

        result.processing_time_ms = data.processing_time_ms;

        if (data.success) {
          result.status = 'success';
          result.events_extracted = data.events_extracted;
          result.events_inserted = data.events_inserted;
          result.events_updated = data.events_updated;
          result.events = data.events;
          summaryData.success++;
          summaryData.total_inserted += data.events_inserted || 0;
          summaryData.total_updated += data.events_updated || 0;

          // Count confidence levels and event types
          for (const event of data.events || []) {
            if (event.confidence === 'high') summaryData.confidence_breakdown.high++;
            else if (event.confidence === 'medium') summaryData.confidence_breakdown.medium++;
            else if (event.confidence === 'low') summaryData.confidence_breakdown.low++;

            summaryData.event_types[event.event_type] = 
              (summaryData.event_types[event.event_type] || 0) + 1;
          }
        } else if (data.skipped) {
          result.status = 'skipped';
          result.reason = data.reason;
          summaryData.skipped++;
        } else {
          result.status = 'error';
          result.error = data.error || 'Unknown error';
          summaryData.errors++;
        }

      } catch (err) {
        result.status = 'error';
        result.error = err instanceof Error ? err.message : 'Unknown error';
        summaryData.errors++;
      }

      testResults.push(result);
      setResults(prev => [...prev.filter(r => r.document_id !== sample.id), result]);
      
      // Small delay between calls to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    setCurrentDoc(null);
    setSummary(summaryData);
    setRunning(false);

    toast({
      title: '✅ Test suite complete',
      description: `${summaryData.success} success, ${summaryData.skipped} skipped, ${summaryData.errors} errors`,
    });
  };

  const runSingleTest = async (sample: typeof allSamples[0]) => {
    setRunning(true);
    setCurrentDoc(sample.doc_number);

    try {
      const { data: processDoc } = await supabase
        .from('process_documents')
        .select('process_id')
        .eq('document_id', sample.id)
        .single();

      if (!processDoc) throw new Error('No process found for document');

      const { data, error } = await supabase.functions.invoke('agent-timeline-v2', {
        body: {
          document_id: sample.id,
          process_id: processDoc.process_id,
        },
      });

      if (error) throw error;

      const result: TestResult = {
        document_id: sample.id,
        doc_number: sample.doc_number,
        doc_type: sample.doc_type,
        status: data.success ? 'success' : data.skipped ? 'skipped' : 'error',
        events_extracted: data.events_extracted,
        events_inserted: data.events_inserted,
        events: data.events,
        reason: data.reason,
        error: data.error,
        processing_time_ms: data.processing_time_ms,
      };

      setResults(prev => [...prev.filter(r => r.document_id !== sample.id), result]);

      toast({
        title: result.status === 'success' ? '✅ Success' : result.status === 'skipped' ? '⚠️ Skipped' : '❌ Error',
        description: result.status === 'success' 
          ? `Extracted ${result.events_inserted} events`
          : result.reason || result.error,
      });

    } catch (err) {
      toast({
        title: '❌ Error',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
      setCurrentDoc(null);
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'skipped': return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-destructive" />;
      case 'running': return <Loader2 className="h-4 w-4 animate-spin" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getConfidenceBadge = (confidence: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      high: 'default',
      medium: 'secondary',
      low: 'outline',
    };
    return <Badge variant={variants[confidence] || 'outline'}>{confidence}</Badge>;
  };

  const completedCount = results.filter(r => r.status !== 'pending' && r.status !== 'running').length;
  const progress = allSamples.length > 0 ? (completedCount / allSamples.length) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          Timeline Agent v2.1 Test Suite
        </CardTitle>
        <CardDescription>
          Testing v2.1 with metadata on {TEST_SAMPLES.directives.length} directives + {TEST_SAMPLES.sous.length} SOUs
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Batch Task Queue Section */}
        <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
          <div className="text-sm font-medium">Batch Task Queue (Rate-Limited Processing)</div>
          
          {/* Document Type Filter */}
          <div className="flex items-center gap-2">
            <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Documents</SelectItem>
                <SelectItem value="sou">SOUs Only</SelectItem>
                <SelectItem value="directive">Directives Only</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={loadUnprocessedCount} disabled={loadingCount} variant="outline" className="gap-2">
              {loadingCount ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Count Unprocessed
            </Button>
            {unprocessedCount > 0 && <Badge variant="outline">{unprocessedCount} unprocessed</Badge>}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => processBatchDocuments(10)}
              disabled={processingBatch || unprocessedCount === 0}
              variant="secondary"
              className="gap-2"
            >
              {processingBatch ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4" />
              )}
              Create 10 Tasks
            </Button>
            <Button
              onClick={() => processBatchDocuments(null)}
              disabled={processingBatch || unprocessedCount === 0}
              variant="default"
              className="gap-2"
            >
              {processingBatch ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Zap className="h-4 w-4" />
              )}
              Create All Tasks ({unprocessedCount})
            </Button>
          </div>
          {batchProgress && (
            <div className="text-sm text-muted-foreground">
              Creating tasks: {batchProgress.processed} / {batchProgress.total}
            </div>
          )}
          <Alert>
            <AlertDescription className="text-xs">
              Creates <code>timeline_extraction</code> tasks in the queue. Use the <strong>Task Queue Monitor</strong> to process them with rate limiting.
            </AlertDescription>
          </Alert>
        </div>

        {/* Test Suite Section */}
        <div className="border-t pt-4">
          <div className="text-sm font-medium mb-3">Manual Test Suite (Pre-selected Samples)</div>
          <Button 
            onClick={runFullTestSuite}
            disabled={running}
            className="w-full"
          >
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing {currentDoc}...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run Full Test Suite (10 documents)
              </>
            )}
          </Button>
        </div>

        {running && (
          <div className="space-y-2">
            <Progress value={progress} />
            <div className="text-sm text-muted-foreground text-center">
              {completedCount} / {allSamples.length} completed
            </div>
          </div>
        )}

        {/* Summary */}
        {summary && (
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <h3 className="font-semibold">Test Summary</h3>
            <div className="grid grid-cols-5 gap-4 text-sm">
              <div>
                <div className="text-2xl font-bold text-green-600">{summary.success}</div>
                <div className="text-muted-foreground">Success</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-600">{summary.skipped}</div>
                <div className="text-muted-foreground">Skipped</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{summary.errors}</div>
                <div className="text-muted-foreground">Errors</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-600">{summary.total_inserted}</div>
                <div className="text-muted-foreground">Inserted</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-600">{summary.total_updated}</div>
                <div className="text-muted-foreground">Updated</div>
              </div>
            </div>

            {(summary.total_inserted > 0 || summary.total_updated > 0) && (
              <>
                <div className="border-t pt-3">
                  <h4 className="text-sm font-medium mb-2">Confidence Distribution</h4>
                  <div className="flex gap-4">
                    <Badge variant="default">High: {summary.confidence_breakdown.high}</Badge>
                    <Badge variant="secondary">Medium: {summary.confidence_breakdown.medium}</Badge>
                    <Badge variant="outline">Low: {summary.confidence_breakdown.low}</Badge>
                  </div>
                </div>

                <div className="border-t pt-3">
                  <h4 className="text-sm font-medium mb-2">Event Types</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(summary.event_types).map(([type, count]) => (
                      <Badge key={type} variant="secondary">
                        {type}: {count}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Test Samples */}
        <div className="space-y-4">
          <h3 className="font-semibold">Directives ({TEST_SAMPLES.directives.length})</h3>
          <div className="space-y-2">
            {TEST_SAMPLES.directives.map(sample => {
              const result = results.find(r => r.document_id === sample.id);
              return (
                <div key={sample.id} className="rounded border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {result ? getStatusIcon(result.status) : <Clock className="h-4 w-4 text-muted-foreground" />}
                      <span className="font-medium">{sample.doc_number}</span>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      disabled={running}
                      onClick={() => runSingleTest({ ...sample, doc_type: 'directive' })}
                    >
                      Test
                    </Button>
                  </div>
                  <div className="text-sm text-muted-foreground">{sample.title}</div>
                  <div className="text-xs text-muted-foreground italic">{sample.reason}</div>
                  
                  {result?.events && result.events.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {result.events.map((event, i) => (
                        <div key={i} className="rounded bg-muted/50 p-2 space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <Badge variant="secondary">{event.event_type}</Badge>
                            <span>{event.event_date}</span>
                            {getConfidenceBadge(event.confidence)}
                            {event.action && (
                              <Badge variant={event.action === 'inserted' ? 'default' : 'outline'} className="text-[10px]">
                                {event.action}
                              </Badge>
                            )}
                          </div>
                          {event.metadata && Object.keys(event.metadata).length > 0 && (
                            <div className="text-xs text-muted-foreground pl-2 border-l-2 border-muted">
                              {event.metadata.committee_event_kind && (
                                <div><span className="font-medium">Kind:</span> {event.metadata.committee_event_kind}</div>
                              )}
                              {event.metadata.person_name && (
                                <div><span className="font-medium">Person:</span> {event.metadata.person_name}</div>
                              )}
                              {event.metadata.role && (
                                <div><span className="font-medium">Role:</span> {event.metadata.role}</div>
                              )}
                              {event.metadata.deadline_kind && (
                                <div><span className="font-medium">Deadline:</span> {event.metadata.deadline_kind} #{event.metadata.deadline_index}</div>
                              )}
                              {event.metadata.deadline_label && (
                                <div><span className="font-medium">Label:</span> {event.metadata.deadline_label}</div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {result?.reason && (
                    <div className="text-xs text-yellow-600">{result.reason}</div>
                  )}
                  {result?.error && (
                    <div className="text-xs text-destructive">{result.error}</div>
                  )}
                </div>
              );
            })}
          </div>

          <h3 className="font-semibold">SOUs ({TEST_SAMPLES.sous.length})</h3>
          <div className="space-y-2">
            {TEST_SAMPLES.sous.map(sample => {
              const result = results.find(r => r.document_id === sample.id);
              return (
                <div key={sample.id} className="rounded border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {result ? getStatusIcon(result.status) : <Clock className="h-4 w-4 text-muted-foreground" />}
                      <span className="font-medium">{sample.doc_number}</span>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      disabled={running}
                      onClick={() => runSingleTest({ ...sample, doc_type: 'sou' })}
                    >
                      Test
                    </Button>
                  </div>
                  <div className="text-sm text-muted-foreground">{sample.title}</div>
                  <div className="text-xs text-muted-foreground italic">{sample.reason}</div>
                  
                  {result?.events && result.events.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {result.events.map((event, i) => (
                        <div key={i} className="rounded bg-muted/50 p-2 space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <Badge variant="secondary">{event.event_type}</Badge>
                            <span>{event.event_date}</span>
                            {getConfidenceBadge(event.confidence)}
                            {event.action && (
                              <Badge variant={event.action === 'inserted' ? 'default' : 'outline'} className="text-[10px]">
                                {event.action}
                              </Badge>
                            )}
                          </div>
                          {event.metadata && Object.keys(event.metadata).length > 0 && (
                            <div className="text-xs text-muted-foreground pl-2 border-l-2 border-muted">
                              {event.metadata.committee_event_kind && (
                                <div><span className="font-medium">Kind:</span> {event.metadata.committee_event_kind}</div>
                              )}
                              {event.metadata.person_name && (
                                <div><span className="font-medium">Person:</span> {event.metadata.person_name}</div>
                              )}
                              {event.metadata.role && (
                                <div><span className="font-medium">Role:</span> {event.metadata.role}</div>
                              )}
                              {event.metadata.deadline_kind && (
                                <div><span className="font-medium">Deadline:</span> {event.metadata.deadline_kind} #{event.metadata.deadline_index}</div>
                              )}
                              {event.metadata.deadline_label && (
                                <div><span className="font-medium">Label:</span> {event.metadata.deadline_label}</div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {result?.reason && (
                    <div className="text-xs text-yellow-600">{result.reason}</div>
                  )}
                  {result?.error && (
                    <div className="text-xs text-destructive">{result.error}</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Raw Results */}
        {results.length > 0 && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              View raw results JSON
            </summary>
            <pre className="mt-2 rounded bg-muted p-2 overflow-x-auto max-h-96">
              {JSON.stringify(results, null, 2)}
            </pre>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
