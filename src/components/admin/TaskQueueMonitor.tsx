import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTaskQueue } from '@/hooks/useTaskQueue';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlayCircle, RefreshCw, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export function TaskQueueMonitor() {
  const { stats, recentTasks, isLoading, processTasksMutation, retryFailedTasksMutation } =
    useTaskQueue();

  const handleProcessTasks = async (taskType: string, limit: number) => {
    toast.info(`Processing ${limit} ${taskType} tasks...`);
    try {
      const result = await processTasksMutation.mutateAsync({ taskType, limit });
      toast.success(
        `Processed ${result.succeeded || 0} tasks successfully, ${result.failed || 0} failed`
      );
    } catch (error: any) {
      toast.error(`Failed to process tasks: ${error.message}`);
    }
  };

  const handleRetryFailed = async () => {
    const failedTaskIds = recentTasks
      .filter((t) => t.status === 'failed')
      .map((t) => t.id)
      .slice(0, 5);

    if (failedTaskIds.length === 0) {
      toast.info('No failed tasks to retry');
      return;
    }

    try {
      await retryFailedTasksMutation.mutateAsync(failedTaskIds);
      toast.success(`Reset ${failedTaskIds.length} failed tasks to pending`);
    } catch (error: any) {
      toast.error(`Failed to retry tasks: ${error.message}`);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'outline',
      processing: 'secondary',
      completed: 'default',
      failed: 'destructive',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  const getTaskTypeCount = (taskType: string, status: string) => {
    return stats.find((s) => s.taskType === taskType && s.status === status)?.count || 0;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Task Queue Monitor</CardTitle>
        <CardDescription>Process pending tasks and monitor execution</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Task Type Summary */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-sm font-medium">Document Scraping Tasks</h3>
            <div className="flex gap-2 text-sm">
              <Badge variant="outline">
                Pending: {getTaskTypeCount('fetch_regeringen_document', 'pending')}
              </Badge>
              <Badge variant="secondary">
                Processing: {getTaskTypeCount('fetch_regeringen_document', 'processing')}
              </Badge>
              <Badge>
                Completed: {getTaskTypeCount('fetch_regeringen_document', 'completed')}
              </Badge>
              <Badge variant="destructive">
                Failed: {getTaskTypeCount('fetch_regeringen_document', 'failed')}
              </Badge>
            </div>
            <Button
              size="sm"
              onClick={() => handleProcessTasks('fetch_regeringen_document', 5)}
              disabled={
                processTasksMutation.isPending ||
                getTaskTypeCount('fetch_regeringen_document', 'pending') === 0
              }
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              Process Document Tasks (5)
            </Button>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">PDF Extraction Tasks</h3>
            <div className="flex gap-2 text-sm">
              <Badge variant="outline">
                Pending: {getTaskTypeCount('process_pdf', 'pending')}
              </Badge>
              <Badge variant="secondary">
                Processing: {getTaskTypeCount('process_pdf', 'processing')}
              </Badge>
              <Badge>Completed: {getTaskTypeCount('process_pdf', 'completed')}</Badge>
              <Badge variant="destructive">
                Failed: {getTaskTypeCount('process_pdf', 'failed')}
              </Badge>
            </div>
            <Button
              size="sm"
              onClick={() => handleProcessTasks('process_pdf', 5)}
              disabled={
                processTasksMutation.isPending ||
                getTaskTypeCount('process_pdf', 'pending') === 0
              }
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              Process PDF Tasks (5)
            </Button>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">Timeline Extraction Tasks</h3>
            <div className="flex gap-2 text-sm">
              <Badge variant="outline">
                Pending: {getTaskTypeCount('timeline_extraction', 'pending')}
              </Badge>
              <Badge variant="secondary">
                Processing: {getTaskTypeCount('timeline_extraction', 'processing')}
              </Badge>
              <Badge>Completed: {getTaskTypeCount('timeline_extraction', 'completed')}</Badge>
              <Badge variant="destructive">
                Failed: {getTaskTypeCount('timeline_extraction', 'failed')}
              </Badge>
            </div>
            <Button
              size="sm"
              onClick={() => handleProcessTasks('timeline_extraction', 5)}
              disabled={
                processTasksMutation.isPending ||
                getTaskTypeCount('timeline_extraction', 'pending') === 0
              }
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              Process Timeline Tasks (5)
            </Button>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">Metadata Extraction Tasks</h3>
            <div className="flex gap-2 text-sm">
              <Badge variant="outline">
                Pending: {getTaskTypeCount('metadata_extraction', 'pending')}
              </Badge>
              <Badge variant="secondary">
                Processing: {getTaskTypeCount('metadata_extraction', 'processing')}
              </Badge>
              <Badge>Completed: {getTaskTypeCount('metadata_extraction', 'completed')}</Badge>
              <Badge variant="destructive">
                Failed: {getTaskTypeCount('metadata_extraction', 'failed')}
              </Badge>
            </div>
            <Button
              size="sm"
              onClick={() => handleProcessTasks('metadata_extraction', 10)}
              disabled={
                processTasksMutation.isPending ||
                getTaskTypeCount('metadata_extraction', 'pending') === 0
              }
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              Process Metadata Tasks (10)
            </Button>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-medium">Head Detective Tasks</h3>
            <div className="flex gap-2 text-sm">
              <Badge variant="outline">
                Pending: {getTaskTypeCount('head_detective_analysis', 'pending')}
              </Badge>
              <Badge variant="secondary">
                Processing: {getTaskTypeCount('head_detective_analysis', 'processing')}
              </Badge>
              <Badge>Completed: {getTaskTypeCount('head_detective_analysis', 'completed')}</Badge>
              <Badge variant="destructive">
                Failed: {getTaskTypeCount('head_detective_analysis', 'failed')}
              </Badge>
            </div>
            <Button
              size="sm"
              onClick={() => handleProcessTasks('head_detective_analysis', 10)}
              disabled={
                processTasksMutation.isPending ||
                getTaskTypeCount('head_detective_analysis', 'pending') === 0
              }
            >
              <PlayCircle className="h-4 w-4 mr-2" />
              Process Detective Tasks (10)
            </Button>
          </div>
        </div>

        {/* Retry Failed Button */}
        {recentTasks.filter((t) => t.status === 'failed').length > 0 && (
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetryFailed}
              disabled={retryFailedTasksMutation.isPending}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry Failed Tasks ({recentTasks.filter((t) => t.status === 'failed').length})
            </Button>
          </div>
        )}

        {/* Recent Tasks Table */}
        <div>
          <h3 className="text-sm font-medium mb-2">Recent Task Execution</h3>
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Error</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : recentTasks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No tasks found
                    </TableCell>
                  </TableRow>
                ) : (
                  recentTasks.slice(0, 10).map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-mono text-xs">
                        {task.task_type}
                      </TableCell>
                      <TableCell>{getStatusBadge(task.status)}</TableCell>
                      <TableCell className="text-xs">
                        {new Date(task.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">
                        {task.completed_at
                          ? new Date(task.completed_at).toLocaleString()
                          : '-'}
                      </TableCell>
                      <TableCell>
                        {task.error_message && (
                          <div className="flex items-center gap-1 text-xs text-destructive">
                            <AlertCircle className="h-3 w-3" />
                            <span className="truncate max-w-[200px]">
                              {task.error_message}
                            </span>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
