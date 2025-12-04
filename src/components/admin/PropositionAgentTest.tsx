import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Bot, CheckCircle2, XCircle, Clock, Users } from 'lucide-react';

interface PilotProposition {
  id: string;
  doc_number: string;
  title: string;
  ministry: string | null;
  has_pdf: boolean;
  has_text: boolean;
  text_length: number;
  process_id: string | null;
  process_key: string | null;
  timeline_events_count: number;
  person_entities_count: number;
  minister_count: number;
}

interface AgentResult {
  docNumber: string;
  agentType: 'timeline' | 'metadata';
  success: boolean;
  details?: string;
  error?: string;
}

// Pilot propositions
const PILOT_DOC_NUMBERS = [
  'Prop. 2025/26:36',
  'Prop. 2025/26:48',
  'Prop. 2025/26:42',
];

export function PropositionAgentTest() {
  const [propositions, setPropositions] = useState<PilotProposition[]>([]);
  const [loading, setLoading] = useState(false);
  const [runningTimeline, setRunningTimeline] = useState<string | null>(null);
  const [runningMetadata, setRunningMetadata] = useState<string | null>(null);
  const [agentResults, setAgentResults] = useState<AgentResult[]>([]);

  // Load propositions with their process and counts
  const loadPropositions = async () => {
    setLoading(true);
    try {
      // First get the documents
      const { data: docs, error: docsError } = await supabase
        .from('documents')
        .select('id, doc_number, title, ministry, pdf_url, raw_content')
        .in('doc_number', PILOT_DOC_NUMBERS)
        .eq('doc_type', 'proposition');

      if (docsError) throw docsError;

      // For each document, get process info and counts
      const enrichedPropositions: PilotProposition[] = [];

      for (const doc of docs || []) {
        // Get process link
        const { data: processLink } = await supabase
          .from('process_documents')
          .select('process_id, processes(id, process_key)')
          .eq('document_id', doc.id)
          .single();

        const processId = processLink?.process_id || null;
        const processKey = (processLink?.processes as any)?.process_key || null;

        // Get timeline events count
        let timelineEventsCount = 0;
        if (processId) {
          const { count } = await supabase
            .from('timeline_events')
            .select('id', { count: 'exact', head: true })
            .eq('process_id', processId);
          timelineEventsCount = count || 0;
        }

        // Get person entities count
        const { count: personCount } = await supabase
          .from('entities')
          .select('id', { count: 'exact', head: true })
          .eq('source_document_id', doc.id)
          .eq('entity_type', 'person');

        // Get ministers count (role contains 'minister')
        const { data: ministers } = await supabase
          .from('entities')
          .select('id, role')
          .eq('source_document_id', doc.id)
          .eq('entity_type', 'person');

        const ministerCount = ministers?.filter(e => 
          e.role?.toLowerCase().includes('minister')
        ).length || 0;

        enrichedPropositions.push({
          id: doc.id,
          doc_number: doc.doc_number,
          title: doc.title,
          ministry: doc.ministry,
          has_pdf: !!doc.pdf_url,
          has_text: !!doc.raw_content,
          text_length: doc.raw_content?.length || 0,
          process_id: processId,
          process_key: processKey,
          timeline_events_count: timelineEventsCount,
          person_entities_count: personCount || 0,
          minister_count: ministerCount,
        });
      }

      setPropositions(enrichedPropositions);
      toast.success(`Loaded ${enrichedPropositions.length} pilot propositions`);
    } catch (err) {
      console.error('Error loading propositions:', err);
      toast.error('Failed to load propositions');
    } finally {
      setLoading(false);
    }
  };

  // Run Timeline Agent v2.2 for a proposition
  const runTimelineAgent = async (prop: PilotProposition) => {
    if (!prop.process_id) {
      toast.error(`No process found for ${prop.doc_number}. Run "Setup Processes" first.`);
      return;
    }

    if (!prop.has_text) {
      toast.error(`No text content for ${prop.doc_number}. Run text extraction first.`);
      return;
    }

    setRunningTimeline(prop.id);
    console.log(`[Timeline Agent v2.2] Starting for { docNumber: "${prop.doc_number}", processId: "${prop.process_id}" }`);

    try {
      const { data, error } = await supabase.functions.invoke('agent-timeline-v2', {
        body: {
          document_id: prop.id,
          process_id: prop.process_id,
        }
      });

      if (error) throw error;

      if (data?.success) {
        const inserted = data.events_inserted || 0;
        const updated = data.events_updated || 0;
        const skipped = data.events_skipped || 0;
        console.log(`[Timeline Agent v2.2] Extracted events: ${inserted + updated + skipped}`);
        console.log(`[Timeline Agent v2.2] Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`);
        
        setAgentResults(prev => [...prev, {
          docNumber: prop.doc_number,
          agentType: 'timeline',
          success: true,
          details: `Inserted: ${inserted}, Updated: ${updated}, Skipped: ${skipped}`,
        }]);
        toast.success(`Timeline Agent completed for ${prop.doc_number}`);
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Timeline Agent v2.2] FAILED for ${prop.doc_number}:`, errMsg);
      setAgentResults(prev => [...prev, {
        docNumber: prop.doc_number,
        agentType: 'timeline',
        success: false,
        error: errMsg,
      }]);
      toast.error(`Timeline Agent failed: ${errMsg}`);
    } finally {
      setRunningTimeline(null);
      // Reload to see updated counts
      await loadPropositions();
    }
  };

  // Run Metadata Agent v2.2 for a proposition
  const runMetadataAgent = async (prop: PilotProposition) => {
    if (!prop.process_id) {
      toast.error(`No process found for ${prop.doc_number}. Run "Setup Processes" first.`);
      return;
    }

    if (!prop.has_text) {
      toast.error(`No text content for ${prop.doc_number}. Run text extraction first.`);
      return;
    }

    setRunningMetadata(prop.id);
    console.log(`[Metadata Agent v2.2] Starting for { docNumber: "${prop.doc_number}", processId: "${prop.process_id}" }`);

    try {
      const { data, error } = await supabase.functions.invoke('agent-metadata', {
        body: {
          document_id: prop.id,
          process_id: prop.process_id,
        }
      });

      if (error) throw error;

      if (data?.success) {
        const entityCount = data.entities_created || 0;
        const relationsCount = data.relations_created || 0;
        console.log(`[Metadata Agent v2.2] Extracted ministers: ${entityCount}, totalEntities: ${entityCount}`);
        console.log(`[Metadata Agent v2.2] Completed`);
        
        setAgentResults(prev => [...prev, {
          docNumber: prop.doc_number,
          agentType: 'metadata',
          success: true,
          details: `Entities: ${entityCount}, Relations: ${relationsCount}`,
        }]);
        toast.success(`Metadata Agent completed for ${prop.doc_number}`);
      } else if (data?.skipped) {
        setAgentResults(prev => [...prev, {
          docNumber: prop.doc_number,
          agentType: 'metadata',
          success: true,
          details: `Skipped: ${data.reason || 'No entities found'}`,
        }]);
        toast.info(`Metadata Agent skipped: ${data.reason}`);
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[Metadata Agent v2.2] FAILED for ${prop.doc_number}:`, errMsg);
      setAgentResults(prev => [...prev, {
        docNumber: prop.doc_number,
        agentType: 'metadata',
        success: false,
        error: errMsg,
      }]);
      toast.error(`Metadata Agent failed: ${errMsg}`);
    } finally {
      setRunningMetadata(null);
      // Reload to see updated counts
      await loadPropositions();
    }
  };

  // Run all agents on all propositions
  const runAllAgents = async () => {
    for (const prop of propositions) {
      if (prop.has_text && prop.process_id) {
        await runTimelineAgent(prop);
        await runMetadataAgent(prop);
      }
    }
  };

  // Calculate summary stats
  const readyCount = propositions.filter(p => p.has_text && p.process_id).length;
  const withEventsCount = propositions.filter(p => p.timeline_events_count > 0).length;
  const withMinistersCount = propositions.filter(p => p.minister_count > 0).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          Proposition Agent Pilot Test
        </CardTitle>
        <CardDescription>
          Run Timeline Agent v2.2 and Metadata Agent v2.2 on pilot propositions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Load button */}
        <div className="flex items-center gap-4">
          <Button onClick={loadPropositions} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Load Pilot Status
          </Button>
          {propositions.length > 0 && (
            <Button 
              onClick={runAllAgents} 
              disabled={readyCount === 0 || runningTimeline !== null || runningMetadata !== null}
              variant="default"
            >
              Run All Agents
            </Button>
          )}
        </div>

        {/* Status summary */}
        {propositions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              Total: {propositions.length}
            </Badge>
            <Badge variant={readyCount === propositions.length ? 'default' : 'secondary'}>
              Ready: {readyCount}/{propositions.length}
            </Badge>
            <Badge variant={withEventsCount > 0 ? 'default' : 'secondary'}>
              <Clock className="mr-1 h-3 w-3" />
              With Events: {withEventsCount}
            </Badge>
            <Badge variant={withMinistersCount > 0 ? 'default' : 'secondary'}>
              <Users className="mr-1 h-3 w-3" />
              With Ministers: {withMinistersCount}
            </Badge>
          </div>
        )}

        {/* Propositions table */}
        {propositions.length > 0 && (
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Doc Number</th>
                  <th className="p-2 text-left">PDF</th>
                  <th className="p-2 text-left">Text</th>
                  <th className="p-2 text-left">Process</th>
                  <th className="p-2 text-left">Events</th>
                  <th className="p-2 text-left">Ministers</th>
                  <th className="p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {propositions.map(prop => (
                  <tr key={prop.id} className="border-b">
                    <td className="p-2">
                      <div className="font-mono text-xs">{prop.doc_number}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {prop.ministry}
                      </div>
                    </td>
                    <td className="p-2">
                      {prop.has_pdf ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </td>
                    <td className="p-2">
                      {prop.has_text ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <span className="text-xs text-muted-foreground">
                            {(prop.text_length / 1000).toFixed(0)}k
                          </span>
                        </span>
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </td>
                    <td className="p-2">
                      {prop.process_id ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <span className="text-xs font-mono text-muted-foreground">
                            {prop.process_key}
                          </span>
                        </span>
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </td>
                    <td className="p-2">
                      <Badge variant={prop.timeline_events_count > 0 ? 'default' : 'secondary'}>
                        {prop.timeline_events_count}
                      </Badge>
                    </td>
                    <td className="p-2">
                      <Badge variant={prop.minister_count > 0 ? 'default' : 'secondary'}>
                        {prop.minister_count}
                      </Badge>
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => runTimelineAgent(prop)}
                          disabled={!prop.has_text || !prop.process_id || runningTimeline !== null}
                        >
                          {runningTimeline === prop.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Clock className="h-3 w-3" />
                          )}
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => runMetadataAgent(prop)}
                          disabled={!prop.has_text || !prop.process_id || runningMetadata !== null}
                        >
                          {runningMetadata === prop.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Users className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Agent results log */}
        {agentResults.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Agent Execution Log</h4>
            <div className="rounded-lg border p-3 space-y-1 max-h-48 overflow-y-auto">
              {agentResults.map((result, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {result.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                  <Badge variant="outline" className="text-xs">
                    {result.agentType === 'timeline' ? 'Timeline' : 'Metadata'}
                  </Badge>
                  <span className="font-mono text-xs">{result.docNumber}</span>
                  {result.success && result.details ? (
                    <span className="text-muted-foreground text-xs">— {result.details}</span>
                  ) : result.error ? (
                    <span className="text-destructive text-xs">— {result.error}</span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Verification summary */}
        {propositions.length > 0 && (
          <div className="rounded-lg border p-4 bg-muted/30">
            <h4 className="font-medium mb-2">Pilot Verification Summary</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-1">doc_number</th>
                  <th className="text-left p-1">has_text</th>
                  <th className="text-left p-1">timeline_events</th>
                  <th className="text-left p-1">ministers</th>
                  <th className="text-left p-1">notes</th>
                </tr>
              </thead>
              <tbody>
                {propositions.map(prop => (
                  <tr key={prop.id} className="border-b">
                    <td className="p-1 font-mono text-xs">{prop.doc_number}</td>
                    <td className="p-1">{prop.has_text ? 'yes' : 'no'}</td>
                    <td className="p-1">{prop.timeline_events_count}</td>
                    <td className="p-1">{prop.minister_count}</td>
                    <td className="p-1 text-xs text-muted-foreground">
                      {!prop.has_text && 'Need text extraction'}
                      {prop.has_text && !prop.process_id && 'Need process setup'}
                      {prop.has_text && prop.process_id && prop.timeline_events_count === 0 && 'Need timeline agent'}
                      {prop.has_text && prop.process_id && prop.timeline_events_count > 0 && prop.minister_count === 0 && 'Need metadata agent'}
                      {prop.has_text && prop.process_id && prop.timeline_events_count > 0 && prop.minister_count > 0 && 'OK'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
