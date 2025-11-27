import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Play, Search, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Candidate {
  id: string;
  process_key: string;
  title: string;
  current_stage: string;
}

interface ProcessResult {
  process_id: string;
  process_key: string;
  action: string;
  previous_stage: string;
  new_stage: string | null;
  timeline_task_id: string | null;
  timeline_task_created: boolean;
  metadata_task_id: string | null;
  metadata_task_created: boolean;
  sou_published_event_found: boolean;
  entities_extracted: number;
  reason?: string;
}

interface TestResult {
  success: boolean;
  mode: string;
  version?: string;
  agents?: string[];
  summary: {
    processes_analyzed?: number;
    processes_with_sou?: number;
    timeline_tasks_created: number;
    timeline_tasks_reused: number;
    metadata_tasks_created?: number;
    metadata_tasks_reused?: number;
    stages_updated?: number;
    published_stages?: number;
    published_stages_updated?: number;
    total_entities_extracted?: number;
    skipped?: number;
    skipped_no_action?: number;
  };
  details: ProcessResult[];
}

export function HeadDetectiveTest() {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedProcessId, setSelectedProcessId] = useState<string>('');
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [runningSingle, setRunningSingle] = useState(false);
  const [runningBatch, setRunningBatch] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const loadCandidates = async () => {
    setLoadingCandidates(true);
    try {
      // Find ALL processes with SOU documents (v2 orchestrates both agents)
      const { data: souDocs, error: docError } = await supabase
        .from('documents')
        .select(`
          id,
          doc_number,
          process_documents!inner(
            process_id,
            processes!inner(
              id,
              process_key,
              title,
              current_stage
            )
          )
        `)
        .eq('doc_type', 'sou')
        .not('raw_content', 'is', null)
        .limit(10); // Limit to first 10 for testing

      if (docError) throw docError;

      const candidateList: Candidate[] = [];
      
      if (souDocs) {
        for (const doc of souDocs) {
          const processData = doc.process_documents?.[0]?.processes;
          if (!processData) continue;

          candidateList.push({
            id: processData.id,
            process_key: processData.process_key,
            title: processData.title,
            current_stage: processData.current_stage,
          });
        }
      }

      setCandidates(candidateList);
      toast({
        title: 'Candidates Loaded',
        description: `Found ${candidateList.length} processes with SOU documents (limited to 10 for testing)`,
      });
    } catch (error) {
      console.error('Error loading candidates:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load candidates',
        variant: 'destructive',
      });
    } finally {
      setLoadingCandidates(false);
    }
  };

  const runHeadDetective = async (mode: 'single' | 'batch') => {
    const isRunning = mode === 'single' ? setRunningSingle : setRunningBatch;
    isRunning(true);
    setResult(null);

    try {
      const body: any = { batch_mode: mode === 'batch' };
      if (mode === 'single' && selectedProcessId) {
        body.process_id = selectedProcessId;
      }

      const { data, error } = await supabase.functions.invoke('agent-head-detective', {
        body,
      });

      if (error) throw error;

      setResult(data as TestResult);

      const processedCount = data.summary.processes_analyzed || data.summary.processes_with_sou || 0;
      const stagesUpdated = data.summary.stages_updated || data.summary.published_stages_updated || 0;
      const entitiesExtracted = data.summary.total_entities_extracted || 0;

      toast({
        title: data.success ? 'Success' : 'Failed',
        description: data.success
          ? `Processed ${processedCount} processes, updated ${stagesUpdated} stages, extracted ${entitiesExtracted} entities`
          : 'Head Detective execution failed',
        variant: data.success ? 'default' : 'destructive',
      });
    } catch (error) {
      console.error('Error running Head Detective:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to run Head Detective',
        variant: 'destructive',
      });
    } finally {
      isRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-2xl">🕵️</span>
          Head Detective Agent v2 (Multi-Agent)
        </CardTitle>
        <CardDescription>
          Orchestrates Timeline and Metadata agents to extract events, entities, and update process stages.
          V2 scope: Timeline + Metadata extraction with parallel agent coordination.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Find Candidates */}
        <div>
          <Button
            onClick={loadCandidates}
            disabled={loadingCandidates}
            variant="outline"
            className="w-full sm:w-auto"
          >
            {loadingCandidates ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Find Candidates
          </Button>
          {candidates.length > 0 && (
            <p className="text-sm text-muted-foreground mt-2">
              Found {candidates.length} process{candidates.length !== 1 ? 'es' : ''} ready for multi-agent analysis
            </p>
          )}
        </div>

        {/* Candidates List */}
        {candidates.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm">Candidate Processes:</h4>
            <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
              {candidates.map((c) => (
                <div key={c.id} className="text-xs flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">{c.current_stage}</Badge>
                  <span className="font-mono">{c.process_key}</span>
                  <span className="text-muted-foreground truncate">{c.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Single Process Test */}
        {candidates.length > 0 && (
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Single Process Test:</h4>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={selectedProcessId} onValueChange={setSelectedProcessId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a process..." />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.process_key} - {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => runHeadDetective('single')}
                disabled={!selectedProcessId || runningSingle}
                className="sm:w-auto"
              >
                {runningSingle ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                Run Single
              </Button>
            </div>
          </div>
        )}

        {/* Batch Test */}
        {candidates.length > 0 && (
          <div>
            <Button
              onClick={() => runHeadDetective('batch')}
              disabled={runningBatch}
              variant="default"
              className="w-full sm:w-auto"
            >
              {runningBatch ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Run Batch (All Candidates)
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              This will process all {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}.
              May take several minutes.
            </p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-3 pt-4 border-t">
            <h4 className="font-medium">Results:</h4>
            
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
              <div className="text-center p-2 border rounded-md">
                <div className="text-2xl font-bold text-primary">
                  {result.summary.processes_analyzed || result.summary.processes_with_sou || 0}
                </div>
                <div className="text-xs text-muted-foreground">Processes</div>
              </div>
              <div className="text-center p-2 border rounded-md">
                <div className="text-2xl font-bold text-green-600">
                  {result.summary.stages_updated || result.summary.published_stages_updated || 0}
                </div>
                <div className="text-xs text-muted-foreground">Updated</div>
              </div>
              <div className="text-center p-2 border rounded-md">
                <div className="text-2xl font-bold text-blue-600">{result.summary.timeline_tasks_created}</div>
                <div className="text-xs text-muted-foreground">Timeline↑</div>
              </div>
              <div className="text-center p-2 border rounded-md">
                <div className="text-2xl font-bold text-purple-600">{result.summary.timeline_tasks_reused}</div>
                <div className="text-xs text-muted-foreground">Timeline♻</div>
              </div>
              <div className="text-center p-2 border rounded-md">
                <div className="text-2xl font-bold text-orange-600">{result.summary.metadata_tasks_created || 0}</div>
                <div className="text-xs text-muted-foreground">Metadata↑</div>
              </div>
              <div className="text-center p-2 border rounded-md">
                <div className="text-2xl font-bold text-pink-600">{result.summary.metadata_tasks_reused || 0}</div>
                <div className="text-xs text-muted-foreground">Metadata♻</div>
              </div>
              <div className="text-center p-2 border rounded-md">
                <div className="text-2xl font-bold text-cyan-600">{result.summary.total_entities_extracted || 0}</div>
                <div className="text-xs text-muted-foreground">Entities</div>
              </div>
            </div>

            {/* Details */}
            {result.details.length > 0 && (
              <div className="space-y-2">
                <h5 className="font-medium text-sm">Details:</h5>
                <div className="max-h-80 overflow-y-auto space-y-2">
                  {result.details.map((detail, idx) => (
                    <Alert key={idx}>
                      <AlertDescription>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant={
                              detail.action === 'stage_updated' ? 'default' :
                              detail.action === 'skipped' ? 'secondary' :
                              'outline'
                            }>
                              {detail.action}
                            </Badge>
                            <span className="font-mono text-sm">{detail.process_key}</span>
                            {detail.previous_stage && detail.new_stage && (
                              <span className="text-xs text-muted-foreground">
                                {detail.previous_stage} → {detail.new_stage}
                              </span>
                            )}
                          </div>
                          {detail.reason && (
                            <p className="text-xs text-muted-foreground">{detail.reason}</p>
                          )}
                          <div className="text-xs flex gap-3 flex-wrap">
                            <span>Timeline: {detail.timeline_task_created ? '✅ Created' : detail.timeline_task_id ? '♻️ Reused' : '❌'}</span>
                            <span>Metadata: {detail.metadata_task_created ? '✅ Created' : detail.metadata_task_id ? '♻️ Reused' : '❌'}</span>
                            <span>Event: {detail.sou_published_event_found ? '✅' : '❌'}</span>
                            {detail.entities_extracted > 0 && (
                              <span>Entities: {detail.entities_extracted}</span>
                            )}
                          </div>
                        </div>
                      </AlertDescription>
                    </Alert>
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
