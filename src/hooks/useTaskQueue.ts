import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface TaskQueueStats {
  taskType: string;
  status: string;
  count: number;
}

export interface Task {
  id: string;
  task_type: string;
  status: string;
  priority: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  input_data: Record<string, any>;
  output_data: Record<string, any>;
}

export function useTaskQueue() {
  const queryClient = useQueryClient();

  const { data: stats = [], isLoading: statsLoading } = useQuery({
    queryKey: ['task-queue-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_tasks')
        .select('task_type, status')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Group by task_type and status
      const grouped = data.reduce((acc, task) => {
        const key = `${task.task_type}-${task.status}`;
        if (!acc[key]) {
          acc[key] = {
            taskType: task.task_type,
            status: task.status,
            count: 0,
          };
        }
        acc[key].count++;
        return acc;
      }, {} as Record<string, TaskQueueStats>);

      return Object.values(grouped);
    },
    refetchInterval: 5000,
  });

  const { data: recentTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ['recent-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_tasks')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data as Task[];
    },
    refetchInterval: 5000,
  });

  const processTasksMutation = useMutation({
    mutationFn: async ({
      taskType,
      limit = 5,
    }: {
      taskType: string;
      limit?: number;
    }) => {
      const { data, error } = await supabase.functions.invoke(
        'process-task-queue',
        {
          body: {
            task_type: taskType,
            limit,
            rate_limit_ms: 1000,
          },
        }
      );

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-queue-stats'] });
      queryClient.invalidateQueries({ queryKey: ['recent-tasks'] });
    },
  });

  const retryFailedTasksMutation = useMutation({
    mutationFn: async (taskIds: string[]) => {
      const { error } = await supabase
        .from('agent_tasks')
        .update({ status: 'pending', error_message: null })
        .in('id', taskIds);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['task-queue-stats'] });
      queryClient.invalidateQueries({ queryKey: ['recent-tasks'] });
    },
  });

  return {
    stats,
    recentTasks,
    isLoading: statsLoading || tasksLoading,
    processTasksMutation,
    retryFailedTasksMutation,
  };
}
