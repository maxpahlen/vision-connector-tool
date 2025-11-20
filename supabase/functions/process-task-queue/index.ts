import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import {
  corsHeaders,
  handleCorsPreflightRequest,
  createErrorResponse,
  createSuccessResponse,
} from '../_shared/http-utils.ts';

// ============================================
// Constants and Types
// ============================================

const RequestSchema = z.object({
  limit: z.number().int().positive().max(100).optional().default(10),
  task_type: z.enum(['fetch_regeringen_document', 'process_pdf']).optional(),
  rate_limit_ms: z.number().int().min(0).max(10000).optional().default(1000),
});

interface TaskResult {
  taskId: string;
  status: 'success' | 'failed';
  error?: string;
  documentId?: string;
  docNumber?: string;
}

interface Task {
  id: string;
  task_type: string;
  process_id: string | null;
  document_id: string | null;
  input_data: any;
  created_at: string;
  priority: number;
}

// ============================================
// Utility Functions
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// Task Processing Functions
// ============================================

async function markTaskAsProcessing(supabase: any, taskId: string): Promise<void> {
  await supabase
    .from('agent_tasks')
    .update({
      status: 'processing',
      started_at: new Date().toISOString(),
    })
    .eq('id', taskId);
}

async function markTaskAsCompleted(supabase: any, taskId: string, output_data: any): Promise<void> {
  const { data: taskCheck } = await supabase
    .from('agent_tasks')
    .select('status')
    .eq('id', taskId)
    .single();
  
  if (taskCheck?.status === 'processing') {
    await supabase
      .from('agent_tasks')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        output_data,
      })
      .eq('id', taskId);
  }
}

async function markTaskAsFailed(supabase: any, taskId: string, errorMsg: string): Promise<void> {
  await supabase
    .from('agent_tasks')
    .update({
      status: 'failed',
      error_message: errorMsg,
      completed_at: new Date().toISOString(),
    })
    .eq('id', taskId);
}

async function processFetchRegeringenTask(
  supabase: any,
  task: Task
): Promise<any> {
  const regeringenUrl = task.input_data?.regeringen_url;
  const processId = task.process_id;
  
  if (!regeringenUrl || !processId) {
    throw new Error('Missing regeringen_url or process_id in task input_data');
  }
  
  const { data, error } = await supabase.functions.invoke(
    'scrape-regeringen-document',
    {
      body: {
        task_id: task.id,
        regeringen_url: regeringenUrl,
        process_id: processId,
      },
    }
  );
  
  if (error) {
    throw new Error(`Function invocation failed: ${error.message}`);
  }
  
  return data;
}

async function processePdfTask(
  supabase: any,
  task: Task
): Promise<any> {
  const documentId = task.document_id;
  
  if (!documentId) {
    throw new Error('Missing document_id in task');
  }
  
  console.log(`Calling process-sou-pdf for document: ${documentId}`);
  
  const { data, error } = await supabase.functions.invoke(
    'process-sou-pdf',
    {
      body: {
        documentId: documentId,
      },
    }
  );
  
  if (error) {
    throw new Error(`PDF processing failed: ${error.message}`);
  }
  
  return data;
}

async function processTask(
  supabase: any,
  task: Task,
  index: number,
  totalTasks: number
): Promise<TaskResult> {
  console.log(`Processing task ${index + 1}/${totalTasks}: ${task.id} (type: ${task.task_type})`);
  
  try {
    await markTaskAsProcessing(supabase, task.id);
    
    let result;
    
    if (task.task_type === 'fetch_regeringen_document') {
      result = await processFetchRegeringenTask(supabase, task);
    } else if (task.task_type === 'process_pdf') {
      result = await processePdfTask(supabase, task);
    } else {
      throw new Error(`Unsupported task type: ${task.task_type}`);
    }
    
    if (!result?.success) {
      throw new Error(result?.error || 'Unknown error from function');
    }
    
    await markTaskAsCompleted(supabase, task.id, result);
    
    console.log(`✓ Task ${task.id} completed successfully`);
    
    return {
      taskId: task.id,
      status: 'success',
      documentId: result.document_id,
      docNumber: result.doc_number,
    };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`✗ Task ${task.id} failed:`, errorMsg);
    
    await markTaskAsFailed(supabase, task.id, errorMsg);
    
    return {
      taskId: task.id,
      status: 'failed',
      error: errorMsg,
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
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Validate request body
    const body = await req.json().catch(() => ({}));
    const validationResult = RequestSchema.safeParse(body);
    
    if (!validationResult.success) {
      return createErrorResponse(
        'Invalid request body',
        validationResult.error.issues.map(i => i.message).join(', ')
      );
    }

    const { limit, task_type, rate_limit_ms } = validationResult.data;
    const task_type_value = task_type || null;
    
    console.log(`Starting task queue processing (limit: ${limit}, task_type: ${task_type_value || 'any'}, rate_limit: ${rate_limit_ms}ms)`);
    
    // Fetch pending tasks
    let query = supabase
      .from('agent_tasks')
      .select('id, task_type, process_id, document_id, input_data, created_at, priority')
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(limit);
    
    // Filter by task_type if specified
    if (task_type_value) {
      query = query.eq('task_type', task_type_value);
    }
    
    const { data: tasks, error: fetchError } = await query;
    
    if (fetchError) {
      throw new Error(`Failed to fetch tasks: ${fetchError.message}`);
    }
    
    if (!tasks || tasks.length === 0) {
      console.log('No pending tasks found');
      return createSuccessResponse({
        success: true,
        message: 'No pending tasks to process',
        processed: 0,
        succeeded: 0,
        failed: 0,
      });
    }
    
    console.log(`Found ${tasks.length} pending tasks to process`);
    
    const results: TaskResult[] = [];
    let succeeded = 0;
    let failed = 0;
    
    // Process each task with rate limiting
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const result = await processTask(supabase, task, i, tasks.length);
      
      results.push(result);
      
      if (result.status === 'success') {
        succeeded++;
      } else {
        failed++;
      }
      
      // Rate limiting: wait between requests (except after the last one)
      if (i < tasks.length - 1) {
        console.log(`Rate limiting: waiting ${rate_limit_ms}ms before next request...`);
        await sleep(rate_limit_ms);
      }
    }
    
    console.log(`Queue processing complete: ${succeeded} succeeded, ${failed} failed`);
    
    return createSuccessResponse({
      success: true,
      processed: tasks.length,
      succeeded,
      failed,
      results,
    });
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Fatal error in process-task-queue:', error);
    
    return createErrorResponse(errorMsg, 'An unexpected error occurred', 500);
  }
});
