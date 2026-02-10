import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Play, CheckCircle2, XCircle, Database, Bot, FileText, RotateCcw } from 'lucide-react';

interface PropositionDoc {
  id: string;
  doc_number: string;
  title: string;
  pdf_url: string | null;
  raw_content: string | null;
  ministry: string | null;
}

interface ProcessingStatus {
  docNumber: string;
  stage: 'pending' | 'text' | 'process' | 'timeline' | 'metadata' | 'complete' | 'error';
  textExtracted: boolean;
  processCreated: boolean;
  processId: string | null;
  timelineRun: boolean;
  metadataRun: boolean;
  error?: string;
}

const BATCH_SIZE = 5;

// Pilot propositions to exclude from batch processing
const PILOT_DOC_NUMBERS = [
  'Prop. 2025/26:36',
  'Prop. 2025/26:48',
  'Prop. 2025/26:42',
];

export function PropositionBatchProcessor() {
  const [allPropositions, setAllPropositions] = useState<PropositionDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [processingStatus, setProcessingStatus] = useState<Map<string, ProcessingStatus>>(new Map());
  const [processedCount, setProcessedCount] = useState(0);

  // Load all propositions (excluding pilot)
  const loadPropositions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('id, doc_number, title, pdf_url, raw_content, ministry')
        .eq('doc_type', 'proposition')
        .not('doc_number', 'in', `(${PILOT_DOC_NUMBERS.map(d => `"${d}"`).join(',')})`)
        .order('doc_number', { ascending: true });

      if (error) throw error;

      setAllPropositions(data || []);
      
      // Initialize status for all propositions
      const statusMap = new Map<string, ProcessingStatus>();
      for (const prop of data || []) {
        statusMap.set(prop.id, {
          docNumber: prop.doc_number,
          stage: 'pending',
          textExtracted: !!prop.raw_content,
          processCreated: false, // Will check below
          processId: null,
          timelineRun: false,
          metadataRun: false,
        });
      }

      // Check for existing processes
      for (const prop of data || []) {
        const processKey = normalizeProcessKey(prop.doc_number);
        const { data: processLink } = await supabase
          .from('process_documents')
          .select('process_id')
          .eq('document_id', prop.id)
          .single();

        if (processLink) {
          const status = statusMap.get(prop.id);
          if (status) {
            status.processCreated = true;
            status.processId = processLink.process_id;
          }
        }
      }

      setProcessingStatus(statusMap);
      console.log(`[Batch Processor] Loaded ${data?.length || 0} propositions (excluding ${PILOT_DOC_NUMBERS.length} pilot docs)`);
      toast.success(`Loaded ${data?.length || 0} propositions for batch processing`);
    } catch (err) {
      console.error('[Batch Processor] Error loading propositions:', err);
      toast.error('Failed to load propositions');
    } finally {
      setLoading(false);
    }
  };

  // Normalize doc_number to process_key
  const normalizeProcessKey = (docNumber: string): string => {
    return docNumber
      .toLowerCase()
      .replace(/\. /g, '-')
      .replace(/[/:]/g, '-')
      .replace(/--+/g, '-');
  };

  // Extract text for a single proposition
  const extractText = async (prop: PropositionDoc): Promise<boolean> => {
    if (!prop.pdf_url) {
      console.log(`[Batch] Skip text extraction (no PDF): ${prop.doc_number}`);
      return false;
    }
    if (prop.raw_content) {
      console.log(`[Batch] Skip text extraction (already has text): ${prop.doc_number}`);
      return true;
    }

    try {
      const { data, error } = await supabase.functions.invoke('process-sou-pdf', {
        body: { documentId: prop.id }
      });

      if (error) throw error;
      console.log(`[Batch] Text extracted: ${prop.doc_number} (${data?.metadata?.textLength || 0} chars)`);
      return data?.success !== false;
    } catch (err) {
      console.error(`[Batch] Text extraction failed: ${prop.doc_number}`, err);
      return false;
    }
  };

  // Create process for a proposition
  const createProcess = async (prop: PropositionDoc): Promise<string | null> => {
    const processKey = normalizeProcessKey(prop.doc_number);

    try {
      // Check if process already exists
      const { data: existingProcess } = await supabase
        .from('processes')
        .select('id')
        .eq('process_key', processKey)
        .single();

      let processId: string;

      if (existingProcess) {
        processId = existingProcess.id;
        console.log(`[Batch] Process exists: ${processKey}`);
      } else {
        const { data: newProcess, error: processError } = await supabase
          .from('processes')
          .insert({
            process_key: processKey,
            title: prop.title,
            ministry: prop.ministry,
            current_stage: 'proposition',
          })
          .select('id')
          .single();

        if (processError) throw processError;
        processId = newProcess.id;
        console.log(`[Batch] Process created: ${processKey}`);
      }

      // Check if document is already linked
      const { data: existingLink } = await supabase
        .from('process_documents')
        .select('id')
        .eq('process_id', processId)
        .eq('document_id', prop.id)
        .single();

      if (!existingLink) {
        const { error: linkError } = await supabase
          .from('process_documents')
          .insert({
            process_id: processId,
            document_id: prop.id,
            role: 'proposition',
          });

        if (linkError) throw linkError;
        console.log(`[Batch] Document linked to process: ${prop.doc_number} → ${processKey}`);
      }

      return processId;
    } catch (err) {
      console.error(`[Batch] Process creation failed: ${prop.doc_number}`, err);
      return null;
    }
  };

  // Run Timeline Agent
  const runTimelineAgent = async (documentId: string, processId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('agent-timeline-v2', {
        body: { document_id: documentId, process_id: processId }
      });

      if (error) throw error;
      console.log(`[Batch] Timeline Agent completed: inserted=${data?.events_inserted || 0}`);
      return data?.success === true;
    } catch (err) {
      console.error('[Batch] Timeline Agent failed:', err);
      return false;
    }
  };

  // Run Metadata Agent
  const runMetadataAgent = async (documentId: string, processId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.functions.invoke('agent-metadata', {
        body: { document_id: documentId, process_id: processId }
      });

      if (error) throw error;
      console.log(`[Batch] Metadata Agent completed: entities=${data?.entities_created || 0}`);
      return data?.success === true || data?.skipped === true;
    } catch (err) {
      console.error('[Batch] Metadata Agent failed:', err);
      return false;
    }
  };

  // Update status helper
  const updateStatus = (id: string, updates: Partial<ProcessingStatus>) => {
    setProcessingStatus(prev => {
      const newMap = new Map(prev);
      const current = newMap.get(id);
      if (current) {
        newMap.set(id, { ...current, ...updates });
      }
      return newMap;
    });
  };

  // Process a single proposition through the full pipeline
  const processProposition = async (prop: PropositionDoc): Promise<boolean> => {
    const status = processingStatus.get(prop.id);
    if (!status) return false;

    try {
      // Step 1: Text extraction
      if (!status.textExtracted) {
        updateStatus(prop.id, { stage: 'text' });
        const textSuccess = await extractText(prop);
        if (!textSuccess) {
          updateStatus(prop.id, { stage: 'error', error: 'Text extraction failed' });
          return false;
        }
        updateStatus(prop.id, { textExtracted: true });
      }

      // Step 2: Process creation
      updateStatus(prop.id, { stage: 'process' });
      let processId = status.processId;
      if (!processId) {
        processId = await createProcess(prop);
        if (!processId) {
          updateStatus(prop.id, { stage: 'error', error: 'Process creation failed' });
          return false;
        }
        updateStatus(prop.id, { processCreated: true, processId });
      }

      // Step 3: Timeline Agent
      updateStatus(prop.id, { stage: 'timeline' });
      const timelineSuccess = await runTimelineAgent(prop.id, processId);
      updateStatus(prop.id, { timelineRun: timelineSuccess });

      // Step 4: Metadata Agent
      updateStatus(prop.id, { stage: 'metadata' });
      const metadataSuccess = await runMetadataAgent(prop.id, processId);
      updateStatus(prop.id, { metadataRun: metadataSuccess });

      updateStatus(prop.id, { stage: 'complete' });
      return true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      updateStatus(prop.id, { stage: 'error', error: errMsg });
      return false;
    }
  };

  // Process next batch
  const processNextBatch = async () => {
    const unprocessed = allPropositions.filter(p => {
      const status = processingStatus.get(p.id);
      return status && status.stage !== 'complete' && status.stage !== 'error';
    });

    if (unprocessed.length === 0) {
      toast.info('All propositions have been processed');
      return;
    }

    setProcessing(true);
    const batch = unprocessed.slice(0, BATCH_SIZE);
    setCurrentBatch(prev => prev + 1);

    console.log(`[Batch Processor] Starting batch ${currentBatch + 1}: ${batch.length} propositions`);
    toast.info(`Processing batch: ${batch.map(p => p.doc_number).join(', ')}`);

    let successCount = 0;
    for (const prop of batch) {
      const success = await processProposition(prop);
      if (success) successCount++;
      setProcessedCount(prev => prev + 1);
    }

    console.log(`[Batch Processor] Batch complete: ${successCount}/${batch.length} succeeded`);
    toast.success(`Batch complete: ${successCount}/${batch.length} succeeded`);
    setProcessing(false);
  };

  // Reset all statuses
  const resetStatuses = () => {
    const statusMap = new Map<string, ProcessingStatus>();
    for (const prop of allPropositions) {
      statusMap.set(prop.id, {
        docNumber: prop.doc_number,
        stage: 'pending',
        textExtracted: !!prop.raw_content,
        processCreated: false,
        processId: null,
        timelineRun: false,
        metadataRun: false,
      });
    }
    setProcessingStatus(statusMap);
    setProcessedCount(0);
    setCurrentBatch(0);
    toast.info('Statuses reset');
  };

  // Calculate stats
  const totalCount = allPropositions.length;
  const needsTextCount = allPropositions.filter(p => !p.raw_content && p.pdf_url).length;
  const completedCount = Array.from(processingStatus.values()).filter(s => s.stage === 'complete').length;
  const errorCount = Array.from(processingStatus.values()).filter(s => s.stage === 'error').length;
  const pendingCount = Array.from(processingStatus.values()).filter(s => 
    s.stage === 'pending' || s.stage === 'text' || s.stage === 'process' || s.stage === 'timeline' || s.stage === 'metadata'
  ).length;

  const progressPercent = totalCount > 0 ? ((completedCount + errorCount) / totalCount) * 100 : 0;

  const getStageIcon = (stage: ProcessingStatus['stage']) => {
    switch (stage) {
      case 'complete': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error': return <XCircle className="h-4 w-4 text-red-500" />;
      case 'text': return <FileText className="h-4 w-4 text-blue-500 animate-pulse" />;
      case 'process': return <Database className="h-4 w-4 text-purple-500 animate-pulse" />;
      case 'timeline':
      case 'metadata': return <Bot className="h-4 w-4 text-orange-500 animate-pulse" />;
      default: return <span className="h-4 w-4 text-muted-foreground">—</span>;
    }
  };

  const getStageLabel = (stage: ProcessingStatus['stage']) => {
    switch (stage) {
      case 'complete': return 'Complete';
      case 'error': return 'Error';
      case 'text': return 'Extracting text...';
      case 'process': return 'Creating process...';
      case 'timeline': return 'Running Timeline Agent...';
      case 'metadata': return 'Running Metadata Agent...';
      default: return 'Pending';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          Proposition Batch Processor
        </CardTitle>
        <CardDescription>
          Process propositions in batches of {BATCH_SIZE}: text extraction → process setup → Timeline Agent → Metadata Agent
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Load button */}
        <div className="flex items-center gap-4">
          <Button onClick={loadPropositions} disabled={loading || processing}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Load Propositions
          </Button>
          {allPropositions.length > 0 && (
            <>
              <Button 
                onClick={processNextBatch} 
                disabled={processing || pendingCount === 0}
                variant="default"
              >
                {processing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Process Next Batch ({Math.min(BATCH_SIZE, pendingCount)})
              </Button>
              <Button 
                onClick={resetStatuses} 
                disabled={processing}
                variant="outline"
                size="icon"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {/* Status summary */}
        {allPropositions.length > 0 && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                Total: {totalCount}
              </Badge>
              <Badge variant="secondary">
                Needs Text: {needsTextCount}
              </Badge>
              <Badge variant="default">
                Completed: {completedCount}
              </Badge>
              {errorCount > 0 && (
                <Badge variant="destructive">
                  Errors: {errorCount}
                </Badge>
              )}
              <Badge variant="outline">
                Pending: {pendingCount}
              </Badge>
            </div>

            {/* Progress bar */}
            <div className="space-y-1">
              <Progress value={progressPercent} className="h-2" />
              <div className="text-xs text-muted-foreground">
                {completedCount + errorCount} / {totalCount} processed ({progressPercent.toFixed(0)}%)
              </div>
            </div>
          </div>
        )}

        {/* Propositions table */}
        {allPropositions.length > 0 && (
          <div className="rounded-lg border max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 sticky top-0">
                <tr>
                  <th className="p-2 text-left">Doc Number</th>
                  <th className="p-2 text-left">Status</th>
                  <th className="p-2 text-left">Text</th>
                  <th className="p-2 text-left">Process</th>
                  <th className="p-2 text-left">Timeline</th>
                  <th className="p-2 text-left">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {allPropositions.map(prop => {
                  const status = processingStatus.get(prop.id);
                  if (!status) return null;

                  return (
                    <tr key={prop.id} className="border-b">
                      <td className="p-2">
                        <div className="font-mono text-xs">{prop.doc_number}</div>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          {getStageIcon(status.stage)}
                          <span className="text-xs">{getStageLabel(status.stage)}</span>
                        </div>
                        {status.error && (
                          <div className="text-xs text-destructive truncate max-w-[150px]" title={status.error}>
                            {status.error}
                          </div>
                        )}
                      </td>
                      <td className="p-2">
                        {status.textExtracted ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </td>
                      <td className="p-2">
                        {status.processCreated ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </td>
                      <td className="p-2">
                        {status.timelineRun ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </td>
                      <td className="p-2">
                        {status.metadataRun ? (
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-muted-foreground" />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {allPropositions.length === 0 && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            Click "Load Propositions" to get started
          </div>
        )}
      </CardContent>
    </Card>
  );
}
