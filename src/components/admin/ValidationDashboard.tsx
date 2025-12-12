import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface DocTypeStats {
  doc_type: string;
  total: number;
  with_text: number;
  with_url: number;
  with_pdf: number;
}

interface TimelineCoverage {
  doc_type: string;
  docs: number;
  timeline_events: number;
  pct_with_timeline: number;
}

interface EntityCoverage {
  doc_type: string;
  docs: number;
  entities: number;
  pct_with_entities: number;
}

interface TaskStatus {
  task_type: string;
  status: string;
  count: number;
}

function StatusBadge({ value, total, threshold = 80 }: { value: number; total: number; threshold?: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  
  if (pct >= threshold) {
    return <Badge variant="default" className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />{value}/{total}</Badge>;
  } else if (pct >= 50) {
    return <Badge variant="secondary" className="bg-yellow-600"><AlertCircle className="w-3 h-3 mr-1" />{value}/{total}</Badge>;
  }
  return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />{value}/{total}</Badge>;
}

export function ValidationDashboard() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Document stats by type
  const { data: docStats, refetch: refetchDocs, isLoading: loadingDocs } = useQuery({
    queryKey: ["validation-doc-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("doc_type, raw_content, url, pdf_url");
      
      if (error) throw error;

      const stats: Record<string, DocTypeStats> = {};
      
      for (const doc of data || []) {
        if (!stats[doc.doc_type]) {
          stats[doc.doc_type] = { doc_type: doc.doc_type, total: 0, with_text: 0, with_url: 0, with_pdf: 0 };
        }
        stats[doc.doc_type].total++;
        if (doc.raw_content) stats[doc.doc_type].with_text++;
        if (doc.url) stats[doc.doc_type].with_url++;
        if (doc.pdf_url) stats[doc.doc_type].with_pdf++;
      }

      return Object.values(stats).sort((a, b) => a.doc_type.localeCompare(b.doc_type));
    },
  });

  // Timeline coverage
  const { data: timelineStats, refetch: refetchTimeline, isLoading: loadingTimeline } = useQuery({
    queryKey: ["validation-timeline-stats"],
    queryFn: async () => {
      const { data: docs, error: docsError } = await supabase
        .from("documents")
        .select("id, doc_type");
      if (docsError) throw docsError;

      const { data: processDocLinks, error: pdError } = await supabase
        .from("process_documents")
        .select("document_id, process_id");
      if (pdError) throw pdError;

      const { data: events, error: eventsError } = await supabase
        .from("timeline_events")
        .select("id, process_id");
      if (eventsError) throw eventsError;

      const processToEvents = new Map<string, number>();
      for (const e of events || []) {
        processToEvents.set(e.process_id, (processToEvents.get(e.process_id) || 0) + 1);
      }

      const docToProcess = new Map<string, string>();
      for (const pd of processDocLinks || []) {
        docToProcess.set(pd.document_id, pd.process_id);
      }

      const stats: Record<string, TimelineCoverage> = {};
      
      for (const doc of docs || []) {
        if (!stats[doc.doc_type]) {
          stats[doc.doc_type] = { doc_type: doc.doc_type, docs: 0, timeline_events: 0, pct_with_timeline: 0 };
        }
        stats[doc.doc_type].docs++;
        const processId = docToProcess.get(doc.id);
        if (processId && processToEvents.has(processId)) {
          stats[doc.doc_type].timeline_events += processToEvents.get(processId) || 0;
        }
      }

      for (const s of Object.values(stats)) {
        s.pct_with_timeline = s.docs > 0 ? Math.round((s.timeline_events / s.docs) * 10) / 10 : 0;
      }

      return Object.values(stats).sort((a, b) => a.doc_type.localeCompare(b.doc_type));
    },
  });

  // Entity coverage
  const { data: entityStats, refetch: refetchEntities, isLoading: loadingEntities } = useQuery({
    queryKey: ["validation-entity-stats"],
    queryFn: async () => {
      const { data: docs, error: docsError } = await supabase
        .from("documents")
        .select("id, doc_type");
      if (docsError) throw docsError;

      const { data: entities, error: entitiesError } = await supabase
        .from("entities")
        .select("id, source_document_id");
      if (entitiesError) throw entitiesError;

      const docToEntities = new Map<string, number>();
      for (const e of entities || []) {
        if (e.source_document_id) {
          docToEntities.set(e.source_document_id, (docToEntities.get(e.source_document_id) || 0) + 1);
        }
      }

      const stats: Record<string, EntityCoverage> = {};
      
      for (const doc of docs || []) {
        if (!stats[doc.doc_type]) {
          stats[doc.doc_type] = { doc_type: doc.doc_type, docs: 0, entities: 0, pct_with_entities: 0 };
        }
        stats[doc.doc_type].docs++;
        stats[doc.doc_type].entities += docToEntities.get(doc.id) || 0;
      }

      for (const s of Object.values(stats)) {
        s.pct_with_entities = s.docs > 0 ? Math.round((s.entities / s.docs) * 10) / 10 : 0;
      }

      return Object.values(stats).sort((a, b) => a.doc_type.localeCompare(b.doc_type));
    },
  });

  // Agent task status
  const { data: taskStats, refetch: refetchTasks, isLoading: loadingTasks } = useQuery({
    queryKey: ["validation-task-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_tasks")
        .select("task_type, status");
      
      if (error) throw error;

      const stats: Record<string, TaskStatus> = {};
      
      for (const task of data || []) {
        const key = `${task.task_type}-${task.status}`;
        if (!stats[key]) {
          stats[key] = { task_type: task.task_type, status: task.status || 'unknown', count: 0 };
        }
        stats[key].count++;
      }

      return Object.values(stats).sort((a, b) => 
        a.task_type.localeCompare(b.task_type) || a.status.localeCompare(b.status)
      );
    },
  });

  // Table counts
  const { data: tableCounts, refetch: refetchCounts, isLoading: loadingCounts } = useQuery({
    queryKey: ["validation-table-counts"],
    queryFn: async () => {
      const tables = [
        "documents", "document_references", "entities", "timeline_events",
        "agent_tasks", "processes", "process_documents", "relations",
        "remiss_documents", "remiss_responses"
      ];
      
      const counts: Record<string, number> = {};
      
      for (const table of tables) {
        const { count, error } = await supabase
          .from(table as any)
          .select("*", { count: "exact", head: true });
        
        if (!error) {
          counts[table] = count || 0;
        }
      }
      
      return counts;
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      refetchDocs(),
      refetchTimeline(),
      refetchEntities(),
      refetchTasks(),
      refetchCounts(),
    ]);
    setIsRefreshing(false);
  };

  const isLoading = loadingDocs || loadingTimeline || loadingEntities || loadingTasks || loadingCounts;
  const totalDocs = docStats?.reduce((sum, s) => sum + s.total, 0) || 0;
  const totalWithText = docStats?.reduce((sum, s) => sum + s.with_text, 0) || 0;
  const pendingTasks = taskStats?.filter(t => t.status === 'pending').reduce((sum, t) => sum + t.count, 0) || 0;
  const failedTasks = taskStats?.filter(t => t.status === 'failed').reduce((sum, t) => sum + t.count, 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Validation Dashboard</h2>
          <p className="text-muted-foreground">Data quality metrics for the controlled rebuild</p>
        </div>
        <Button onClick={handleRefresh} disabled={isRefreshing || isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Documents</CardDescription>
            <CardTitle className="text-3xl">{totalDocs}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Target: 180-200</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>With Text</CardDescription>
            <CardTitle className="text-3xl">{totalWithText}</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBadge value={totalWithText} total={totalDocs} threshold={95} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Tasks</CardDescription>
            <CardTitle className="text-3xl">{pendingTasks}</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingTasks === 0 ? (
              <Badge variant="default" className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />Clean</Badge>
            ) : (
              <Badge variant="secondary" className="bg-yellow-600"><AlertCircle className="w-3 h-3 mr-1" />In Progress</Badge>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed Tasks</CardDescription>
            <CardTitle className="text-3xl">{failedTasks}</CardTitle>
          </CardHeader>
          <CardContent>
            {failedTasks === 0 ? (
              <Badge variant="default" className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" />Clean</Badge>
            ) : (
              <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Issues</Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Table Counts */}
      <Card>
        <CardHeader>
          <CardTitle>Table Row Counts</CardTitle>
          <CardDescription>Current state of all content tables</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {tableCounts && Object.entries(tableCounts).map(([table, count]) => (
              <div key={table} className="text-center p-3 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-xs text-muted-foreground">{table}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Document Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Document Coverage</CardTitle>
          <CardDescription>Text, URL, and PDF extraction status by document type</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Doc Type</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">With Text</TableHead>
                <TableHead className="text-right">With URL</TableHead>
                <TableHead className="text-right">With PDF</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {docStats?.map((row) => (
                <TableRow key={row.doc_type}>
                  <TableCell className="font-medium">{row.doc_type}</TableCell>
                  <TableCell className="text-right">{row.total}</TableCell>
                  <TableCell className="text-right">
                    <StatusBadge value={row.with_text} total={row.total} threshold={95} />
                  </TableCell>
                  <TableCell className="text-right">
                    <StatusBadge value={row.with_url} total={row.total} />
                  </TableCell>
                  <TableCell className="text-right">
                    <StatusBadge value={row.with_pdf} total={row.total} />
                  </TableCell>
                </TableRow>
              ))}
              {(!docStats || docStats.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No documents yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Timeline & Entity Coverage */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Timeline Events</CardTitle>
            <CardDescription>Events per document type</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doc Type</TableHead>
                  <TableHead className="text-right">Docs</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                  <TableHead className="text-right">Avg/Doc</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timelineStats?.map((row) => (
                  <TableRow key={row.doc_type}>
                    <TableCell className="font-medium">{row.doc_type}</TableCell>
                    <TableCell className="text-right">{row.docs}</TableCell>
                    <TableCell className="text-right">{row.timeline_events}</TableCell>
                    <TableCell className="text-right">{row.pct_with_timeline}</TableCell>
                  </TableRow>
                ))}
                {(!timelineStats || timelineStats.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No timeline data yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Entities</CardTitle>
            <CardDescription>Entities per document type</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doc Type</TableHead>
                  <TableHead className="text-right">Docs</TableHead>
                  <TableHead className="text-right">Entities</TableHead>
                  <TableHead className="text-right">Avg/Doc</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entityStats?.map((row) => (
                  <TableRow key={row.doc_type}>
                    <TableCell className="font-medium">{row.doc_type}</TableCell>
                    <TableCell className="text-right">{row.docs}</TableCell>
                    <TableCell className="text-right">{row.entities}</TableCell>
                    <TableCell className="text-right">{row.pct_with_entities}</TableCell>
                  </TableRow>
                ))}
                {(!entityStats || entityStats.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No entity data yet
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Agent Tasks */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Task Status</CardTitle>
          <CardDescription>Task processing status (goal: 0 pending, 0 failed)</CardDescription>
        </CardHeader>
        <CardContent>
          {taskStats && taskStats.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taskStats.map((row) => (
                  <TableRow key={`${row.task_type}-${row.status}`}>
                    <TableCell className="font-medium">{row.task_type}</TableCell>
                    <TableCell>
                      {row.status === 'completed' && (
                        <Badge variant="default" className="bg-green-600">{row.status}</Badge>
                      )}
                      {row.status === 'pending' && (
                        <Badge variant="secondary" className="bg-yellow-600">{row.status}</Badge>
                      )}
                      {row.status === 'failed' && (
                        <Badge variant="destructive">{row.status}</Badge>
                      )}
                      {!['completed', 'pending', 'failed'].includes(row.status) && (
                        <Badge variant="outline">{row.status}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-center text-muted-foreground py-4">No tasks yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
