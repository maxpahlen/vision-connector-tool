import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  corsHeaders,
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/http-utils.ts';
import { 
  computeProcessStage, 
  ProcessEvidence,
  type ProcessStage 
} from '../_shared/process-stage-machine.ts';

// ============================================
// # Protected Code - Do Not Edit
// Head Detective Agent v1 - Timeline-Only Orchestrator
// ============================================
//
// PHILOSOPHY:
// The Head Detective orchestrates specialist agents but NEVER infers or assumes.
// It reacts ONLY to evidence produced by specialist agents.
// If Timeline Agent did not extract a published event, Head Detective does not guess.
//
// V1 SCOPE (Timeline-Only):
// - Detect candidate processes (has SOU, no sou_published event)
// - Create or reuse Timeline Agent tasks (no duplicates)
// - Wait for Timeline Agent completion
// - Update process stage using evidence-based state machine
// - Return detailed, auditable summary
//
// OUT OF SCOPE FOR V1:
// - Metadata extraction
// - Entity extraction
// - Multiple agent delegation
// - Multi-document reasoning
// ============================================

const RequestSchema = z.object({
  process_id: z.string().uuid().optional(),
  batch_mode: z.boolean().optional().default(false),
  task_id: z.string().uuid().optional(),
});

interface ProcessCandidate {
  id: string;
  process_key: string;
  title: string;
  current_stage: string;
  sou_document_id: string;
  sou_doc_number: string;
}

interface ProcessResult {
  process_id: string;
  process_key: string;
  action: 'timeline_created' | 'timeline_reused' | 'stage_updated' | 'skipped';
  previous_stage: string;
  new_stage: string | null;
  timeline_event_id: string | null;
  proof_page: number | null;
  sou_published_event_found: boolean;
  reason?: string;
}

// ============================================
// Utility Functions
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Candidate Detection
// ============================================

async function findCandidateProcesses(
  supabase: any,
  singleProcessId?: string
): Promise<ProcessCandidate[]> {
  console.log('🔍 Finding candidate processes...');
  
  // Build query for processes with SOU documents
  let query = supabase
    .from('documents')
    .select(`
      id,
      doc_number,
      doc_type,
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
    .not('raw_content', 'is', null);
  
  if (singleProcessId) {
    // Filter through the join
    query = query.eq('process_documents.process_id', singleProcessId);
  }
  
  const { data: souDocuments, error } = await query;
  
  if (error) {
    throw new Error(`Failed to fetch SOU documents: ${error.message}`);
  }
  
  if (!souDocuments || souDocuments.length === 0) {
    console.log('No SOU documents found');
    return [];
  }
  
  console.log(`Found ${souDocuments.length} SOU documents with content`);
  
  // Filter out processes that already have sou_published events
  const candidates: ProcessCandidate[] = [];
  
  for (const doc of souDocuments) {
    const processData = doc.process_documents?.[0]?.processes;
    if (!processData) continue;
    
    // Check if this process already has a sou_published event
    const { data: existingEvents, error: eventError } = await supabase
      .from('timeline_events')
      .select('id')
      .eq('process_id', processData.id)
      .eq('event_type', 'sou_published')
      .limit(1);
    
    if (eventError) {
      console.error(`Error checking events for process ${processData.id}:`, eventError);
      continue;
    }
    
    if (existingEvents && existingEvents.length > 0) {
      console.log(`⏭️  Process ${processData.process_key} already has sou_published event - skipping`);
      continue;
    }
    
    candidates.push({
      id: processData.id,
      process_key: processData.process_key,
      title: processData.title,
      current_stage: processData.current_stage,
      sou_document_id: doc.id,
      sou_doc_number: doc.doc_number,
    });
  }
  
  console.log(`✅ Found ${candidates.length} candidate processes needing timeline extraction`);
  
  return candidates;
}

// ============================================
// Task Management (Idempotency)
// ============================================

async function getOrCreateTimelineTask(
  supabase: any,
  processId: string,
  documentId: string
): Promise<{ taskId: string; created: boolean }> {
  console.log(`🔍 Checking for existing timeline task (process: ${processId}, doc: ${documentId})`);
  
  // Check for existing task (pending or processing)
  const { data: existingTasks, error: fetchError } = await supabase
    .from('agent_tasks')
    .select('id, status')
    .eq('task_type', 'timeline_extraction')
    .eq('process_id', processId)
    .eq('document_id', documentId)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1);
  
  if (fetchError) {
    throw new Error(`Failed to check existing tasks: ${fetchError.message}`);
  }
  
  if (existingTasks && existingTasks.length > 0) {
    console.log(`♻️  Reusing existing task: ${existingTasks[0].id} (status: ${existingTasks[0].status})`);
    return { taskId: existingTasks[0].id, created: false };
  }
  
  // No existing task - create new one
  console.log('✨ Creating new timeline extraction task');
  
  const { data: newTask, error: createError } = await supabase
    .from('agent_tasks')
    .insert({
      task_type: 'timeline_extraction',
      agent_name: 'timeline-agent',
      process_id: processId,
      document_id: documentId,
      status: 'pending',
      priority: 100,
      input_data: {
        source: 'head_detective',
        created_by: 'agent-head-detective-v1',
      },
    })
    .select('id')
    .single();
  
  if (createError) {
    throw new Error(`Failed to create timeline task: ${createError.message}`);
  }
  
  console.log(`✅ Created timeline task: ${newTask.id}`);
  
  return { taskId: newTask.id, created: true };
}

// ============================================
// Task Polling & Completion
// ============================================

async function waitForTaskCompletion(
  supabase: any,
  taskId: string,
  maxWaitSeconds: number = 120
): Promise<{ status: string; output_data: any; error_message: string | null }> {
  console.log(`⏳ Waiting for task ${taskId} to complete (max ${maxWaitSeconds}s)...`);
  
  const startTime = Date.now();
  const pollIntervalMs = 2000; // Poll every 2 seconds
  
  while (true) {
    const elapsed = (Date.now() - startTime) / 1000;
    
    if (elapsed > maxWaitSeconds) {
      throw new Error(`Task ${taskId} did not complete within ${maxWaitSeconds} seconds`);
    }
    
    const { data: task, error } = await supabase
      .from('agent_tasks')
      .select('status, output_data, error_message')
      .eq('id', taskId)
      .single();
    
    if (error) {
      throw new Error(`Failed to check task status: ${error.message}`);
    }
    
    if (task.status === 'completed') {
      console.log(`✅ Task ${taskId} completed successfully`);
      return task;
    }
    
    if (task.status === 'failed') {
      console.log(`❌ Task ${taskId} failed: ${task.error_message}`);
      return task;
    }
    
    // Still pending or processing - wait and poll again
    await sleep(pollIntervalMs);
  }
}

// ============================================
// Evidence Gathering & Stage Computation
// ============================================

async function gatherEvidenceAndUpdateStage(
  supabase: any,
  processId: string,
  processKey: string,
  previousStage: string
): Promise<ProcessResult> {
  console.log(`📊 Gathering evidence for process ${processKey}...`);
  
  // Gather all evidence from the database
  const evidence: ProcessEvidence = {
    hasDirective: false,
    hasSou: false,
    hasRemissDocument: false,
    hasProposition: false,
    hasLaw: false,
    hasDirectiveIssuedEvent: false,
    hasSouPublishedEvent: false,
    hasRemissEvents: false,
    hasPropositionEvent: false,
    hasLawEnactedEvent: false,
    currentStage: previousStage as ProcessStage,
  };
  
  // Check for documents linked to this process
  const { data: processDocuments } = await supabase
    .from('process_documents')
    .select('role, documents(doc_type)')
    .eq('process_id', processId);
  
  if (processDocuments) {
    for (const pd of processDocuments) {
      const docType = pd.documents?.doc_type;
      if (docType === 'directive') evidence.hasDirective = true;
      if (docType === 'sou') evidence.hasSou = true;
      if (docType === 'remiss') evidence.hasRemissDocument = true;
      if (docType === 'proposition') evidence.hasProposition = true;
      if (docType === 'law') evidence.hasLaw = true;
    }
  }
  
  // Check for timeline events
  const { data: timelineEvents } = await supabase
    .from('timeline_events')
    .select('event_type, event_date, id, source_page')
    .eq('process_id', processId);
  
  let souPublishedEventId: string | null = null;
  let souPublishedPage: number | null = null;
  
  if (timelineEvents) {
    for (const event of timelineEvents) {
      if (event.event_type === 'directive_issued') evidence.hasDirectiveIssuedEvent = true;
      if (event.event_type === 'sou_published') {
        evidence.hasSouPublishedEvent = true;
        souPublishedEventId = event.id;
        souPublishedPage = event.source_page;
        if (event.event_date) {
          evidence.souPublicationDate = new Date(event.event_date);
        }
      }
      if (event.event_type === 'remiss_start' || event.event_type === 'remiss_end') {
        evidence.hasRemissEvents = true;
      }
      if (event.event_type === 'proposition_submitted') evidence.hasPropositionEvent = true;
      if (event.event_type === 'law_enacted') evidence.hasLawEnactedEvent = true;
    }
  }
  
  // Compute new stage using state machine
  const stageResult = computeProcessStage(evidence);
  
  console.log(`📈 Stage computation result: ${previousStage} → ${stageResult.stage}`);
  console.log(`   Explanation: ${stageResult.explanation}`);
  
  // Determine if stage actually changed
  const stageChanged = previousStage !== stageResult.stage;
  
  if (stageChanged) {
    // Update process table
    console.log(`💾 Updating process ${processKey} to stage: ${stageResult.stage}`);
    
    const { error: updateError } = await supabase
      .from('processes')
      .update({
        current_stage: stageResult.stage,
        stage_explanation: stageResult.explanation,
        updated_at: new Date().toISOString(),
      })
      .eq('id', processId);
    
    if (updateError) {
      throw new Error(`Failed to update process stage: ${updateError.message}`);
    }
    
    return {
      process_id: processId,
      process_key: processKey,
      action: 'stage_updated',
      previous_stage: previousStage,
      new_stage: stageResult.stage,
      timeline_event_id: souPublishedEventId,
      proof_page: souPublishedPage,
      sou_published_event_found: evidence.hasSouPublishedEvent,
    };
  } else {
    console.log(`⏭️  No stage change needed for ${processKey}`);
    
    return {
      process_id: processId,
      process_key: processKey,
      action: 'skipped',
      previous_stage: previousStage,
      new_stage: null,
      timeline_event_id: souPublishedEventId,
      proof_page: souPublishedPage,
      sou_published_event_found: evidence.hasSouPublishedEvent,
      reason: 'Stage computation resulted in same stage',
    };
  }
}

// ============================================
// Process Single Candidate
// ============================================

async function processCandidate(
  supabase: any,
  candidate: ProcessCandidate
): Promise<ProcessResult> {
  console.log(`\n🎯 Processing candidate: ${candidate.process_key}`);
  console.log(`   Current stage: ${candidate.current_stage}`);
  console.log(`   SOU document: ${candidate.sou_doc_number}`);
  
  try {
    // Step 1: Get or create timeline task (idempotency check)
    const { taskId, created } = await getOrCreateTimelineTask(
      supabase,
      candidate.id,
      candidate.sou_document_id
    );
    
    // Step 2: If we created a new task, trigger the task queue to process it
    if (created) {
      console.log('🚀 Triggering timeline agent via task queue...');
      
      // Invoke the task queue processor for this specific task
      const { error: queueError } = await supabase.functions.invoke(
        'process-task-queue',
        {
          body: {
            limit: 1,
            task_type: 'timeline_extraction',
          },
        }
      );
      
      if (queueError) {
        console.error('Warning: Failed to trigger task queue:', queueError);
        // Don't throw - task is still pending and can be processed later
      }
    }
    
    // Step 3: Wait for task completion
    const taskResult = await waitForTaskCompletion(supabase, taskId);
    
    if (taskResult.status === 'failed') {
      return {
        process_id: candidate.id,
        process_key: candidate.process_key,
        action: 'skipped',
        previous_stage: candidate.current_stage,
        new_stage: null,
        timeline_event_id: null,
        proof_page: null,
        sou_published_event_found: false,
        reason: `Timeline extraction failed: ${taskResult.error_message}`,
      };
    }
    
    // Step 4: Gather evidence and update stage
    return await gatherEvidenceAndUpdateStage(
      supabase,
      candidate.id,
      candidate.process_key,
      candidate.current_stage
    );
    
  } catch (error) {
    console.error(`❌ Error processing candidate ${candidate.process_key}:`, error);
    
    return {
      process_id: candidate.id,
      process_key: candidate.process_key,
      action: 'skipped',
      previous_stage: candidate.current_stage,
      new_stage: null,
      timeline_event_id: null,
      proof_page: null,
      sou_published_event_found: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================
// Main Handler
// ============================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
  }
  
  const startTime = Date.now();
  
  try {
    console.log('🕵️ Head Detective Agent v1 - Starting...');
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse and validate request
    const body = await req.json().catch(() => ({}));
    const validationResult = RequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      return createErrorResponse(
        'Invalid request',
        validationResult.error.issues.map(i => i.message).join(', ')
      );
    }
    
    const { process_id, batch_mode, task_id } = validationResult.data;
    const mode = process_id ? 'single' : 'batch';
    
    console.log(`Mode: ${mode}`);
    if (process_id) console.log(`Target process: ${process_id}`);
    if (task_id) console.log(`Task ID: ${task_id}`);
    
    // Find candidates
    const candidates = await findCandidateProcesses(supabase, process_id);
    
    if (candidates.length === 0) {
      const message = process_id 
        ? 'Process not found or already has timeline event'
        : 'No candidate processes found';
      
      console.log(`ℹ️  ${message}`);
      
      const output_data = {
        version: '1.0.0',
        mode,
        summary: {
          processes_with_sou: 0,
          timeline_tasks_created: 0,
          timeline_tasks_reused: 0,
          published_stages_updated: 0,
          skipped_no_action: 0,
        },
        details: [],
      };
      
      // Update task if provided
      if (task_id) {
        await supabase
          .from('agent_tasks')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            output_data,
          })
          .eq('id', task_id);
      }
      
      return createSuccessResponse({
        success: true,
        message,
        ...output_data,
      });
    }
    
    // Process candidates
    const results: ProcessResult[] = [];
    
    for (const candidate of candidates) {
      const result = await processCandidate(supabase, candidate);
      results.push(result);
    }
    
    // Compute summary statistics
    const summary = {
      processes_with_sou: candidates.length,
      timeline_tasks_created: results.filter(r => 
        r.action === 'timeline_created'
      ).length,
      timeline_tasks_reused: results.filter(r => 
        r.action === 'timeline_reused'
      ).length,
      published_stages_updated: results.filter(r => 
        r.action === 'stage_updated' && r.new_stage === 'published'
      ).length,
      skipped_no_action: results.filter(r => 
        r.action === 'skipped'
      ).length,
    };
    
    const processingTime = Date.now() - startTime;
    
    const output_data = {
      version: '1.0.0',
      mode,
      model: 'state-machine-only',
      processing_time_ms: processingTime,
      summary,
      details: results,
    };
    
    // Update task if provided
    if (task_id) {
      await supabase
        .from('agent_tasks')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          output_data,
        })
        .eq('id', task_id);
    }
    
    console.log('\n✅ Head Detective completed');
    console.log(`   Processed: ${candidates.length} candidates`);
    console.log(`   Updated: ${summary.published_stages_updated} to published`);
    console.log(`   Skipped: ${summary.skipped_no_action}`);
    console.log(`   Time: ${processingTime}ms`);
    
    return createSuccessResponse({
      success: true,
      ...output_data,
    });
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('❌ Head Detective fatal error:', error);
    
    return createErrorResponse(errorMsg, 'Head Detective failed', 500);
  }
});
