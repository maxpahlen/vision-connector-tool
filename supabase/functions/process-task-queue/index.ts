import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TaskResult {
  taskId: string;
  status: 'success' | 'failed';
  error?: string;
  documentId?: string;
  docNumber?: string;
}

// Sleep utility for rate limiting
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Parse request parameters
    const { 
      limit = 10, 
      task_type = 'fetch_regeringen_document',
      rate_limit_ms = 2000 // 2 seconds between requests
    } = await req.json().catch(() => ({}));
    
    console.log(`Starting task queue processing (limit: ${limit}, rate_limit: ${rate_limit_ms}ms)`);
    
    // Fetch pending tasks
    const { data: tasks, error: fetchError } = await supabase
      .from('agent_tasks')
      .select('id, process_id, input_data, created_at, priority')
      .eq('task_type', task_type)
      .eq('status', 'pending')
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(limit);
    
    if (fetchError) {
      throw new Error(`Failed to fetch tasks: ${fetchError.message}`);
    }
    
    if (!tasks || tasks.length === 0) {
      console.log('No pending tasks found');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No pending tasks to process',
          processed: 0,
          succeeded: 0,
          failed: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }
    
    console.log(`Found ${tasks.length} pending tasks to process`);
    
    const results: TaskResult[] = [];
    let succeeded = 0;
    let failed = 0;
    
    // Process each task with rate limiting
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      
      try {
        console.log(`Processing task ${i + 1}/${tasks.length}: ${task.id}`);
        
        // Mark task as processing
        await supabase
          .from('agent_tasks')
          .update({
            status: 'processing',
            started_at: new Date().toISOString(),
          })
          .eq('id', task.id);
        
        // Extract input data
        const regeringenUrl = task.input_data?.regeringen_url;
        const processId = task.process_id;
        
        if (!regeringenUrl || !processId) {
          throw new Error('Missing regeringen_url or process_id in task input_data');
        }
        
        // Call scrape-regeringen-document function
        const { data: result, error: invokeError } = await supabase.functions.invoke(
          'scrape-regeringen-document',
          {
            body: {
              task_id: task.id,
              regeringen_url: regeringenUrl,
              process_id: processId,
            },
          }
        );
        
        if (invokeError) {
          throw new Error(`Function invocation failed: ${invokeError.message}`);
        }
        
        if (!result?.success) {
          throw new Error(result?.error || 'Unknown error from scrape function');
        }
        
        console.log(`✓ Task ${task.id} completed successfully`);
        
        results.push({
          taskId: task.id,
          status: 'success',
          documentId: result.document_id,
          docNumber: result.doc_number,
        });
        
        succeeded++;
        
      } catch (taskError) {
        const errorMsg = taskError instanceof Error ? taskError.message : String(taskError);
        console.error(`✗ Task ${task.id} failed:`, errorMsg);
        
        // Update task status to failed
        await supabase
          .from('agent_tasks')
          .update({
            status: 'failed',
            error_message: errorMsg,
            completed_at: new Date().toISOString(),
          })
          .eq('id', task.id);
        
        results.push({
          taskId: task.id,
          status: 'failed',
          error: errorMsg,
        });
        
        failed++;
      }
      
      // Rate limiting: wait between requests (except after the last one)
      if (i < tasks.length - 1) {
        console.log(`Rate limiting: waiting ${rate_limit_ms}ms before next request...`);
        await sleep(rate_limit_ms);
      }
    }
    
    console.log(`Queue processing complete: ${succeeded} succeeded, ${failed} failed`);
    
    return new Response(
      JSON.stringify({
        success: true,
        processed: tasks.length,
        succeeded,
        failed,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('Fatal error in process-task-queue:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMsg,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
