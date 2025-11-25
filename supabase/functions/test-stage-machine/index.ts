// ============================================
// Test Stage Machine - Verify stage computation logic
// ============================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { 
  computeProcessStage, 
  isValidTransition, 
  ProcessEvidence,
  ProcessStage 
} from '../_shared/process-stage-machine.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TestResult {
  process_id: string;
  process_key: string;
  title: string;
  current_stage: ProcessStage;
  computed_stage: ProcessStage;
  computed_explanation: string;
  matches: boolean;
  is_valid_transition: boolean;
  evidence: ProcessEvidence;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all processes with related data
    const { data: processes, error: processError } = await supabase
      .from('processes')
      .select(`
        id,
        process_key,
        title,
        current_stage,
        process_documents!inner(
          document_id,
          role,
          documents!inner(
            doc_type,
            publication_date
          )
        ),
        timeline_events(
          event_type,
          event_date
        )
      `);

    if (processError) {
      throw processError;
    }

    const results: TestResult[] = [];

    for (const process of processes || []) {
      // Collect evidence from documents
      const documents = process.process_documents || [];
      const events = process.timeline_events || [];

      const evidence: ProcessEvidence = {
        hasDirective: documents.some((pd: any) => 
          pd.role === 'directive' || pd.documents?.doc_type === 'dir'
        ),
        hasSou: documents.some((pd: any) => 
          pd.role === 'sou' || pd.documents?.doc_type === 'sou'
        ),
        hasRemissDocument: documents.some((pd: any) => 
          pd.role === 'remiss' || pd.documents?.doc_type === 'remiss'
        ),
        hasProposition: documents.some((pd: any) => 
          pd.role === 'proposition' || pd.documents?.doc_type === 'prop'
        ),
        hasLaw: documents.some((pd: any) => 
          pd.role === 'law' || pd.documents?.doc_type === 'law'
        ),
        
        // Check timeline events
        hasDirectiveIssuedEvent: events.some((e: any) => 
          e.event_type === 'directive_issued'
        ),
        hasSouPublishedEvent: events.some((e: any) => 
          e.event_type === 'sou_published'
        ),
        hasRemissEvents: events.some((e: any) => 
          e.event_type === 'remiss_started' || e.event_type === 'remiss_ended'
        ),
        hasPropositionEvent: events.some((e: any) => 
          e.event_type === 'proposition_submitted'
        ),
        hasLawEnactedEvent: events.some((e: any) => 
          e.event_type === 'law_enacted'
        ),
        
        currentStage: process.current_stage as ProcessStage,
        
        // Get SOU publication date if available
        souPublicationDate: (() => {
          const souDoc = documents.find((pd: any) => 
            pd.role === 'sou' || pd.documents?.doc_type === 'sou'
          );
          const doc: any = souDoc?.documents;
          if (doc && !Array.isArray(doc) && doc.publication_date) {
            return new Date(doc.publication_date);
          }
          return undefined;
        })(),
      };

      // Compute stage using the state machine
      const computed = computeProcessStage(evidence);
      
      // Check if transition is valid
      const validTransition = isValidTransition(
        process.current_stage as ProcessStage,
        computed.stage
      );

      results.push({
        process_id: process.id,
        process_key: process.process_key,
        title: process.title,
        current_stage: process.current_stage as ProcessStage,
        computed_stage: computed.stage,
        computed_explanation: computed.explanation,
        matches: process.current_stage === computed.stage,
        is_valid_transition: validTransition,
        evidence,
      });
    }

    // Generate summary
    const summary = {
      total_processes: results.length,
      matches: results.filter(r => r.matches).length,
      mismatches: results.filter(r => !r.matches).length,
      invalid_transitions: results.filter(r => !r.is_valid_transition && !r.matches).length,
    };

    return new Response(
      JSON.stringify({ 
        summary,
        results: results.sort((a, b) => {
          // Show mismatches first
          if (!a.matches && b.matches) return -1;
          if (a.matches && !b.matches) return 1;
          return 0;
        })
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Stage machine test error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorDetails = error instanceof Error ? error.toString() : String(error);
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: errorDetails
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );
  }
});
