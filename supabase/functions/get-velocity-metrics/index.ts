import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ProcessVelocity {
  process_id: string;
  process_title: string;
  ministry: string;
  directive_date: string;
  remiss_deadline: string;
  days_to_remiss: number;
}

interface MinistryStats {
  ministry: string;
  process_count: number;
  avg_days: number;
  min_days: number;
  max_days: number;
  median_days: number;
}

interface VelocitySummary {
  total_processes: number;
  overall_avg_days: number;
  overall_min_days: number;
  overall_max_days: number;
  ministry_stats: MinistryStats[];
  processes: ProcessVelocity[];
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all directive_issued events
    const directiveEvents: Map<string, string> = new Map();
    let directivePage = 0;
    const pageSize = 1000;
    
    while (true) {
      const { data, error } = await supabase
        .from("timeline_events")
        .select("process_id, event_date")
        .eq("event_type", "directive_issued")
        .order("event_date", { ascending: true })
        .range(directivePage * pageSize, (directivePage + 1) * pageSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      // Take the earliest directive date per process
      for (const event of data) {
        if (!directiveEvents.has(event.process_id)) {
          directiveEvents.set(event.process_id, event.event_date);
        }
      }
      
      if (data.length < pageSize) break;
      directivePage++;
    }

    // Fetch all remiss_period_end events
    const remissEvents: Map<string, string> = new Map();
    let remissPage = 0;
    
    while (true) {
      const { data, error } = await supabase
        .from("timeline_events")
        .select("process_id, event_date")
        .eq("event_type", "remiss_period_end")
        .order("event_date", { ascending: true })
        .range(remissPage * pageSize, (remissPage + 1) * pageSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      // Take the earliest remiss end date per process
      for (const event of data) {
        if (!remissEvents.has(event.process_id)) {
          remissEvents.set(event.process_id, event.event_date);
        }
      }
      
      if (data.length < pageSize) break;
      remissPage++;
    }

    // Find processes with both events
    const matchedProcessIds = [...directiveEvents.keys()].filter(id => remissEvents.has(id));

    // Fetch process details for matched processes
    const processDetails: Map<string, { title: string; ministry: string }> = new Map();
    
    // Batch fetch processes in chunks of 100
    for (let i = 0; i < matchedProcessIds.length; i += 100) {
      const chunk = matchedProcessIds.slice(i, i + 100);
      const { data, error } = await supabase
        .from("processes")
        .select("id, title, ministry")
        .in("id", chunk);
      
      if (error) throw error;
      if (data) {
        for (const p of data) {
          processDetails.set(p.id, { 
            title: p.title, 
            ministry: p.ministry || "" // Will be enriched from directive documents
          });
        }
      }
    }

    // Fetch directive documents to get ministry data (more reliable source)
    // Get source_url from directive_issued events and match to documents
    const directiveMinistries: Map<string, string> = new Map();
    
    // Build a set of source URLs from directive events
    const sourceUrls: string[] = [];
    let urlPage = 0;
    
    while (true) {
      const { data, error } = await supabase
        .from("timeline_events")
        .select("process_id, source_url")
        .eq("event_type", "directive_issued")
        .not("source_url", "is", null)
        .in("process_id", matchedProcessIds)
        .range(urlPage * pageSize, (urlPage + 1) * pageSize - 1);
      
      if (error) throw error;
      if (!data || data.length === 0) break;
      
      for (const event of data) {
        if (event.source_url) {
          sourceUrls.push(event.source_url);
        }
      }
      
      if (data.length < pageSize) break;
      urlPage++;
    }
    
    // Fetch directive documents with their ministries
    if (sourceUrls.length > 0) {
      for (let i = 0; i < sourceUrls.length; i += 100) {
        const chunk = sourceUrls.slice(i, i + 100);
        const { data, error } = await supabase
          .from("documents")
          .select("url, ministry")
          .eq("doc_type", "directive")
          .in("url", chunk);
        
        if (error) throw error;
        if (data) {
          // Build URL -> ministry map
          const urlToMinistry = new Map<string, string>();
          for (const doc of data) {
            if (doc.url && doc.ministry) {
              urlToMinistry.set(doc.url, doc.ministry);
            }
          }
          
          // Now map back to process_id using directive events
          for (const [processId, directiveDate] of directiveEvents.entries()) {
            if (!matchedProcessIds.includes(processId)) continue;
            
            // Find the source_url for this process's directive event
            const { data: eventData } = await supabase
              .from("timeline_events")
              .select("source_url")
              .eq("process_id", processId)
              .eq("event_type", "directive_issued")
              .not("source_url", "is", null)
              .limit(1)
              .maybeSingle();
            
            if (eventData?.source_url && urlToMinistry.has(eventData.source_url)) {
              directiveMinistries.set(processId, urlToMinistry.get(eventData.source_url)!);
            }
          }
        }
      }
    }
    
    // Merge ministry data: prefer directive document ministry, fallback to process ministry
    for (const [processId, details] of processDetails.entries()) {
      const directiveMinistry = directiveMinistries.get(processId);
      if (directiveMinistry) {
        processDetails.set(processId, { ...details, ministry: directiveMinistry });
      } else if (!details.ministry) {
        processDetails.set(processId, { ...details, ministry: "Okänt departement" });
      }
    }

    // Calculate velocity for each matched process
    const processes: ProcessVelocity[] = [];
    
    for (const processId of matchedProcessIds) {
      const directiveDate = directiveEvents.get(processId)!;
      const remissDeadline = remissEvents.get(processId)!;
      const details = processDetails.get(processId);
      
      const d1 = new Date(directiveDate);
      const d2 = new Date(remissDeadline);
      const daysToRemiss = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
      
      // Only include positive durations (remiss after directive)
      if (daysToRemiss > 0 && details) {
        processes.push({
          process_id: processId,
          process_title: details.title,
          ministry: details.ministry,
          directive_date: directiveDate,
          remiss_deadline: remissDeadline,
          days_to_remiss: daysToRemiss,
        });
      }
    }

    // Sort by days ascending
    processes.sort((a, b) => a.days_to_remiss - b.days_to_remiss);

    // Calculate ministry statistics
    const ministryMap: Map<string, number[]> = new Map();
    for (const p of processes) {
      if (!ministryMap.has(p.ministry)) {
        ministryMap.set(p.ministry, []);
      }
      ministryMap.get(p.ministry)!.push(p.days_to_remiss);
    }

    const ministry_stats: MinistryStats[] = [];
    for (const [ministry, days] of ministryMap.entries()) {
      ministry_stats.push({
        ministry,
        process_count: days.length,
        avg_days: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
        min_days: Math.min(...days),
        max_days: Math.max(...days),
        median_days: calculateMedian(days),
      });
    }

    // Sort ministry stats by process count descending
    ministry_stats.sort((a, b) => b.process_count - a.process_count);

    // Calculate overall statistics
    const allDays = processes.map(p => p.days_to_remiss);
    const summary: VelocitySummary = {
      total_processes: processes.length,
      overall_avg_days: allDays.length > 0 ? Math.round(allDays.reduce((a, b) => a + b, 0) / allDays.length) : 0,
      overall_min_days: allDays.length > 0 ? Math.min(...allDays) : 0,
      overall_max_days: allDays.length > 0 ? Math.max(...allDays) : 0,
      ministry_stats,
      processes,
    };

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    console.error("Error fetching velocity metrics:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
