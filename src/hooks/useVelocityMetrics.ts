import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ProcessVelocity {
  process_id: string;
  process_title: string;
  ministry: string;
  directive_date: string;
  remiss_deadline: string;
  days_to_remiss: number;
}

export interface MinistryStats {
  ministry: string;
  process_count: number;
  avg_days: number;
  min_days: number;
  max_days: number;
  median_days: number;
}

export interface VelocitySummary {
  total_processes: number;
  overall_avg_days: number;
  overall_min_days: number;
  overall_max_days: number;
  ministry_stats: MinistryStats[];
  processes: ProcessVelocity[];
}

export function useVelocityMetrics() {
  return useQuery({
    queryKey: ["velocity-metrics"],
    queryFn: async (): Promise<VelocitySummary> => {
      const { data, error } = await supabase.functions.invoke(
        "get-velocity-metrics",
        {
          body: null,
          method: "GET",
        }
      );

      if (error) throw error;
      return data;
    },
    staleTime: 60000, // 1 minute
  });
}
