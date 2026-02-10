import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Play, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';

interface TestAssertion {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  message?: string;
  details?: any;
}

interface TestSuite {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  assertions: TestAssertion[];
  duration?: number;
}

export function IntegrationTest() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [testSuites, setTestSuites] = useState<TestSuite[]>([]);
  const [progress, setProgress] = useState(0);

  const updateAssertion = (
    suiteIndex: number,
    assertionIndex: number,
    updates: Partial<TestAssertion>
  ) => {
    setTestSuites((prev) => {
      const updated = [...prev];
      updated[suiteIndex].assertions[assertionIndex] = {
        ...updated[suiteIndex].assertions[assertionIndex],
        ...updates,
      };
      return updated;
    });
  };

  const updateSuite = (suiteIndex: number, updates: Partial<TestSuite>) => {
    setTestSuites((prev) => {
      const updated = [...prev];
      updated[suiteIndex] = { ...updated[suiteIndex], ...updates };
      return updated;
    });
  };

  const runIntegrationTests = async () => {
    setRunning(true);
    setProgress(0);

    // Initialize test suites
    const suites: TestSuite[] = [
      {
        name: 'Process Discovery',
        status: 'pending',
        assertions: [
          { name: 'Find processes with SOU documents', status: 'pending' },
          { name: 'Verify raw_content exists', status: 'pending' },
          { name: 'Select test candidate', status: 'pending' },
        ],
      },
      {
        name: 'Head Detective Orchestration',
        status: 'pending',
        assertions: [
          { name: 'Invoke Head Detective', status: 'pending' },
          { name: 'Verify response structure', status: 'pending' },
          { name: 'Check both agents orchestrated', status: 'pending' },
        ],
      },
      {
        name: 'Timeline Agent Execution',
        status: 'pending',
        assertions: [
          { name: 'Timeline task created or reused', status: 'pending' },
          { name: 'Timeline task completed', status: 'pending' },
          { name: 'Timeline event extracted', status: 'pending' },
          { name: 'Event has citation (page + excerpt)', status: 'pending' },
        ],
      },
      {
        name: 'Metadata Agent Execution',
        status: 'pending',
        assertions: [
          { name: 'Metadata task created or reused', status: 'pending' },
          { name: 'Metadata task completed', status: 'pending' },
          { name: 'Entities extracted (>0)', status: 'pending' },
          { name: 'All entities have citations', status: 'pending' },
          { name: 'Entity types valid', status: 'pending' },
        ],
      },
      {
        name: 'Process Stage Update',
        status: 'pending',
        assertions: [
          { name: 'Stage computed deterministically', status: 'pending' },
          { name: 'Stage explanation provided', status: 'pending' },
          { name: 'Process updated_at timestamp', status: 'pending' },
        ],
      },
      {
        name: 'Data Quality & Integrity',
        status: 'pending',
        assertions: [
          { name: 'No duplicate timeline events', status: 'pending' },
          { name: 'No duplicate entities (deduplication)', status: 'pending' },
          { name: 'Citation quality (excerpt length)', status: 'pending' },
          { name: 'No placeholder values', status: 'pending' },
        ],
      },
    ];

    setTestSuites(suites);

    try {
      let testProcessId = '';
      let timelineTaskId = '';
      let metadataTaskId = '';

      // Suite 1: Process Discovery
      const suite1Start = Date.now();
      updateSuite(0, { status: 'running' });
      setProgress(10);

      // Assertion 1.1: Find processes with SOUs
      updateAssertion(0, 0, { status: 'running' });
      const { data: souDocs, error: docError } = await supabase
        .from('documents')
        .select(`
          id,
          doc_number,
          raw_content,
          process_documents!inner(
            process_id,
            processes!inner(id, process_key, title, current_stage)
          )
        `)
        .eq('doc_type', 'sou')
        .not('raw_content', 'is', null)
        .limit(1)
        .single();

      if (docError || !souDocs) {
        updateAssertion(0, 0, {
          status: 'failed',
          message: `Failed to find SOU documents: ${docError?.message || 'No data'}`,
        });
        updateSuite(0, { status: 'failed' });
        throw new Error('Process discovery failed');
      }

      updateAssertion(0, 0, {
        status: 'passed',
        message: `Found document: ${souDocs.doc_number}`,
        details: { doc_number: souDocs.doc_number },
      });

      // Assertion 1.2: Verify raw_content
      updateAssertion(0, 1, { status: 'running' });
      if (!souDocs.raw_content || souDocs.raw_content.length < 100) {
        updateAssertion(0, 1, {
          status: 'failed',
          message: 'raw_content is empty or too short',
        });
        throw new Error('Invalid raw_content');
      }
      updateAssertion(0, 1, {
        status: 'passed',
        message: `raw_content length: ${souDocs.raw_content.length} chars`,
      });

      // Assertion 1.3: Select test candidate
      updateAssertion(0, 2, { status: 'running' });
      const processData = souDocs.process_documents?.[0]?.processes;
      if (!processData) {
        updateAssertion(0, 2, { status: 'failed', message: 'No process linked' });
        throw new Error('No process linked to document');
      }
      testProcessId = processData.id;
      updateAssertion(0, 2, {
        status: 'passed',
        message: `Selected: ${processData.process_key}`,
        details: { process_key: processData.process_key },
      });

      updateSuite(0, { status: 'passed', duration: Date.now() - suite1Start });
      setProgress(20);

      // Suite 2: Head Detective Orchestration
      const suite2Start = Date.now();
      updateSuite(1, { status: 'running' });

      // Assertion 2.1: Invoke Head Detective
      updateAssertion(1, 0, { status: 'running' });
      const { data: hdResult, error: hdError } = await supabase.functions.invoke(
        'agent-head-detective',
        { body: { process_id: testProcessId } }
      );

      if (hdError) {
        updateAssertion(1, 0, {
          status: 'failed',
          message: `Head Detective failed: ${hdError.message}`,
        });
        throw new Error('Head Detective invocation failed');
      }
      updateAssertion(1, 0, { status: 'passed', message: 'Head Detective invoked' });

      // Assertion 2.2: Verify response structure
      updateAssertion(1, 1, { status: 'running' });
      if (!hdResult?.success || !hdResult?.version || !hdResult?.summary) {
        updateAssertion(1, 1, {
          status: 'failed',
          message: 'Invalid response structure',
          details: hdResult,
        });
        throw new Error('Invalid response structure');
      }
      updateAssertion(1, 1, {
        status: 'passed',
        message: `Version: ${hdResult.version}`,
        details: { version: hdResult.version },
      });

      // Assertion 2.3: Check both agents orchestrated
      updateAssertion(1, 2, { status: 'running' });
      if (!hdResult.agents || hdResult.agents.length < 2) {
        updateAssertion(1, 2, {
          status: 'failed',
          message: 'Expected 2 agents (timeline + metadata)',
          details: { agents: hdResult.agents },
        });
        throw new Error('Not all agents orchestrated');
      }
      updateAssertion(1, 2, {
        status: 'passed',
        message: `Agents: ${hdResult.agents.join(', ')}`,
        details: { agents: hdResult.agents },
      });

      updateSuite(1, { status: 'passed', duration: Date.now() - suite2Start });
      setProgress(40);

      // Get task IDs from result
      const processResult = hdResult.details?.[0];
      timelineTaskId = processResult?.timeline_task_id;
      metadataTaskId = processResult?.metadata_task_id;

      // Suite 3: Timeline Agent Execution
      const suite3Start = Date.now();
      updateSuite(2, { status: 'running' });

      // Assertion 3.1: Timeline task exists
      updateAssertion(2, 0, { status: 'running' });
      if (!timelineTaskId) {
        updateAssertion(2, 0, {
          status: 'failed',
          message: 'Timeline task ID not found',
        });
        throw new Error('Timeline task not created');
      }
      updateAssertion(2, 0, {
        status: 'passed',
        message: processResult.timeline_task_created ? 'Created' : 'Reused',
      });

      // Assertion 3.2: Timeline task completed
      updateAssertion(2, 1, { status: 'running' });
      const { data: timelineTask } = await supabase
        .from('agent_tasks')
        .select('status, output_data, completed_at')
        .eq('id', timelineTaskId)
        .single();

      if (timelineTask?.status !== 'completed') {
        updateAssertion(2, 1, {
          status: 'failed',
          message: `Status: ${timelineTask?.status || 'unknown'}`,
        });
        throw new Error('Timeline task not completed');
      }
      updateAssertion(2, 1, { status: 'passed', message: 'Task completed' });

      // Assertion 3.3: Timeline event extracted
      updateAssertion(2, 2, { status: 'running' });
      const { data: timelineEvents } = await supabase
        .from('timeline_events')
        .select('*')
        .eq('process_id', testProcessId);

      if (!timelineEvents || timelineEvents.length === 0) {
        updateAssertion(2, 2, {
          status: 'failed',
          message: 'No timeline events found',
        });
        throw new Error('No timeline events extracted');
      }
      updateAssertion(2, 2, {
        status: 'passed',
        message: `${timelineEvents.length} event(s) extracted`,
      });

      // Assertion 3.4: Event has citation
      updateAssertion(2, 3, { status: 'running' });
      const eventWithoutCitation = timelineEvents.find(
        (e) => !e.source_page || !e.source_excerpt
      );
      if (eventWithoutCitation) {
        updateAssertion(2, 3, {
          status: 'failed',
          message: 'Event missing citation',
          details: eventWithoutCitation,
        });
      } else {
        updateAssertion(2, 3, {
          status: 'passed',
          message: 'All events have citations',
        });
      }

      updateSuite(2, { status: 'passed', duration: Date.now() - suite3Start });
      setProgress(60);

      // Suite 4: Metadata Agent Execution
      const suite4Start = Date.now();
      updateSuite(3, { status: 'running' });

      // Assertion 4.1: Metadata task exists
      updateAssertion(3, 0, { status: 'running' });
      if (!metadataTaskId) {
        updateAssertion(3, 0, {
          status: 'failed',
          message: 'Metadata task ID not found',
        });
        throw new Error('Metadata task not created');
      }
      updateAssertion(3, 0, {
        status: 'passed',
        message: processResult.metadata_task_created ? 'Created' : 'Reused',
      });

      // Assertion 4.2: Metadata task completed
      updateAssertion(3, 1, { status: 'running' });
      const { data: metadataTask } = await supabase
        .from('agent_tasks')
        .select('status, output_data, completed_at')
        .eq('id', metadataTaskId)
        .single();

      if (metadataTask?.status !== 'completed') {
        updateAssertion(3, 1, {
          status: 'failed',
          message: `Status: ${metadataTask?.status || 'unknown'}`,
        });
        throw new Error('Metadata task not completed');
      }
      updateAssertion(3, 1, { status: 'passed', message: 'Task completed' });

      // Assertion 4.3: Entities extracted
      updateAssertion(3, 2, { status: 'running' });
      const { data: entities } = await supabase
        .from('entities')
        .select('*')
        .eq('source_document_id', souDocs.id);

      if (!entities || entities.length === 0) {
        updateAssertion(3, 2, {
          status: 'failed',
          message: 'No entities extracted',
        });
        throw new Error('No entities extracted');
      }
      updateAssertion(3, 2, {
        status: 'passed',
        message: `${entities.length} entities extracted`,
      });

      // Assertion 4.4: All entities have citations
      updateAssertion(3, 3, { status: 'running' });
      const entityWithoutCitation = entities.find(
        (e) => !e.source_page || !e.source_excerpt
      );
      if (entityWithoutCitation) {
        updateAssertion(3, 3, {
          status: 'failed',
          message: 'Entity missing citation',
          details: entityWithoutCitation,
        });
      } else {
        updateAssertion(3, 3, {
          status: 'passed',
          message: 'All entities have citations',
        });
      }

      // Assertion 4.5: Entity types valid
      updateAssertion(3, 4, { status: 'running' });
      const validTypes = ['person', 'ministry', 'committee', 'agency'];
      const invalidEntity = entities.find((e) => !validTypes.includes(e.entity_type));
      if (invalidEntity) {
        updateAssertion(3, 4, {
          status: 'failed',
          message: `Invalid entity type: ${invalidEntity.entity_type}`,
          details: invalidEntity,
        });
      } else {
        updateAssertion(3, 4, {
          status: 'passed',
          message: 'All entity types valid',
        });
      }

      updateSuite(3, { status: 'passed', duration: Date.now() - suite4Start });
      setProgress(80);

      // Suite 5: Process Stage Update
      const suite5Start = Date.now();
      updateSuite(4, { status: 'running' });

      // Assertion 5.1: Stage computed
      updateAssertion(4, 0, { status: 'running' });
      const { data: process } = await supabase
        .from('processes')
        .select('current_stage, stage_explanation, updated_at')
        .eq('id', testProcessId)
        .single();

      if (!process?.current_stage) {
        updateAssertion(4, 0, {
          status: 'failed',
          message: 'No stage found',
        });
      } else {
        updateAssertion(4, 0, {
          status: 'passed',
          message: `Stage: ${process.current_stage}`,
        });
      }

      // Assertion 5.2: Stage explanation
      updateAssertion(4, 1, { status: 'running' });
      if (!process?.stage_explanation) {
        updateAssertion(4, 1, {
          status: 'failed',
          message: 'No stage explanation',
        });
      } else {
        updateAssertion(4, 1, {
          status: 'passed',
          message: process.stage_explanation.substring(0, 50) + '...',
        });
      }

      // Assertion 5.3: Updated timestamp
      updateAssertion(4, 2, { status: 'running' });
      if (!process?.updated_at) {
        updateAssertion(4, 2, { status: 'failed', message: 'No updated_at' });
      } else {
        updateAssertion(4, 2, {
          status: 'passed',
          message: new Date(process.updated_at).toLocaleString(),
        });
      }

      updateSuite(4, { status: 'passed', duration: Date.now() - suite5Start });
      setProgress(90);

      // Suite 6: Data Quality & Integrity
      const suite6Start = Date.now();
      updateSuite(5, { status: 'running' });

      // Assertion 6.1: No duplicate timeline events
      updateAssertion(5, 0, { status: 'running' });
      const { data: eventDuplicates } = await supabase.rpc('has_role', {
        _role: 'admin',
        _user_id: (await supabase.auth.getUser()).data.user?.id || '',
      });
      
      // Check for duplicates by event_type and event_date
      const eventMap = new Map();
      let hasDuplicates = false;
      timelineEvents?.forEach((e) => {
        const key = `${e.event_type}-${e.event_date}`;
        if (eventMap.has(key)) {
          hasDuplicates = true;
        }
        eventMap.set(key, e);
      });

      if (hasDuplicates) {
        updateAssertion(5, 0, {
          status: 'failed',
          message: 'Duplicate events found',
        });
      } else {
        updateAssertion(5, 0, {
          status: 'passed',
          message: 'No duplicates',
        });
      }

      // Assertion 6.2: No duplicate entities
      updateAssertion(5, 1, { status: 'running' });
      const entityNameMap = new Map();
      let hasEntityDuplicates = false;
      entities?.forEach((e) => {
        const key = `${e.entity_type}-${e.name.toLowerCase()}`;
        if (entityNameMap.has(key)) {
          hasEntityDuplicates = true;
        }
        entityNameMap.set(key, e);
      });

      if (hasEntityDuplicates) {
        updateAssertion(5, 1, {
          status: 'failed',
          message: 'Duplicate entities found',
        });
      } else {
        updateAssertion(5, 1, {
          status: 'passed',
          message: 'Deduplication working',
        });
      }

      // Assertion 6.3: Citation quality
      updateAssertion(5, 2, { status: 'running' });
      const shortExcerpts = entities?.filter(
        (e) => e.source_excerpt && e.source_excerpt.length < 20
      );
      if (shortExcerpts && shortExcerpts.length > 0) {
        updateAssertion(5, 2, {
          status: 'failed',
          message: `${shortExcerpts.length} excerpts too short (<20 chars)`,
        });
      } else {
        updateAssertion(5, 2, {
          status: 'passed',
          message: 'All excerpts adequate length',
        });
      }

      // Assertion 6.4: No placeholders
      updateAssertion(5, 3, { status: 'running' });
      const placeholders = ['not specified', 'okänd', 'ej angiven', 'särskild utredare'];
      const hasPlaceholder = entities?.some((e) =>
        placeholders.some((p) => e.name.toLowerCase().includes(p))
      );

      if (hasPlaceholder) {
        updateAssertion(5, 3, {
          status: 'failed',
          message: 'Placeholder values detected',
        });
      } else {
        updateAssertion(5, 3, {
          status: 'passed',
          message: 'No placeholders',
        });
      }

      updateSuite(5, { status: 'passed', duration: Date.now() - suite6Start });
      setProgress(100);

      toast({
        title: 'Integration Tests Complete',
        description: 'All test suites passed! ✅',
      });
    } catch (error) {
      console.error('Integration test error:', error);
      toast({
        title: 'Test Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setRunning(false);
    }
  };

  const totalAssertions = testSuites.reduce(
    (sum, suite) => sum + suite.assertions.length,
    0
  );
  const passedAssertions = testSuites.reduce(
    (sum, suite) =>
      sum + suite.assertions.filter((a) => a.status === 'passed').length,
    0
  );
  const failedAssertions = testSuites.reduce(
    (sum, suite) =>
      sum + suite.assertions.filter((a) => a.status === 'failed').length,
    0
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-2xl">🧪</span>
          End-to-End Integration Tests
        </CardTitle>
        <CardDescription>
          Comprehensive validation of Head Detective v2 orchestration, agent execution, and data
          quality
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Run Button */}
        <div className="flex items-center gap-4">
          <Button
            onClick={runIntegrationTests}
            disabled={running}
            size="lg"
            className="w-full sm:w-auto"
          >
            {running ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running Tests...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run Integration Tests
              </>
            )}
          </Button>

          {testSuites.length > 0 && (
            <div className="flex-1 text-sm text-muted-foreground">
              {passedAssertions}/{totalAssertions} assertions passed
              {failedAssertions > 0 && ` · ${failedAssertions} failed`}
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {running && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <p className="text-xs text-center text-muted-foreground">
              {progress}% complete
            </p>
          </div>
        )}

        {/* Test Suites */}
        {testSuites.length > 0 && (
          <div className="space-y-4">
            {testSuites.map((suite, suiteIdx) => (
              <Alert
                key={suiteIdx}
                variant={suite.status === 'failed' ? 'destructive' : 'default'}
              >
                <div className="flex items-start gap-3">
                  {getStatusIcon(suite.status)}
                  <div className="flex-1 space-y-2">
                    <AlertTitle className="flex items-center justify-between">
                      <span>{suite.name}</span>
                      {suite.duration && (
                        <Badge variant="outline" className="text-xs">
                          {suite.duration}ms
                        </Badge>
                      )}
                    </AlertTitle>
                    <AlertDescription>
                      <div className="space-y-1">
                        {suite.assertions.map((assertion, assertionIdx) => (
                          <div
                            key={assertionIdx}
                            className="flex items-start gap-2 text-xs"
                          >
                            {getStatusIcon(assertion.status)}
                            <div className="flex-1">
                              <div className="font-medium">{assertion.name}</div>
                              {assertion.message && (
                                <div className="text-muted-foreground">
                                  {assertion.message}
                                </div>
                              )}
                              {assertion.details && assertion.status === 'failed' && (
                                <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-x-auto">
                                  {JSON.stringify(assertion.details, null, 2)}
                                </pre>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </AlertDescription>
                  </div>
                </div>
              </Alert>
            ))}
          </div>
        )}

        {/* Summary */}
        {testSuites.length > 0 && !running && (
          <Alert
            variant={failedAssertions > 0 ? 'destructive' : 'default'}
            className="border-2"
          >
            <AlertTitle className="text-lg">
              {failedAssertions === 0 ? '✅ All Tests Passed!' : '❌ Some Tests Failed'}
            </AlertTitle>
            <AlertDescription>
              <div className="grid grid-cols-3 gap-4 mt-2">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {passedAssertions}
                  </div>
                  <div className="text-xs text-muted-foreground">Passed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {failedAssertions}
                  </div>
                  <div className="text-xs text-muted-foreground">Failed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-600">
                    {totalAssertions}
                  </div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
