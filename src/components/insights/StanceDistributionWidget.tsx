import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { 
  ThumbsUp, 
  ThumbsDown, 
  Scale, 
  Minus, 
  HelpCircle, 
  FileText,
  PieChart
} from 'lucide-react';

interface StanceCount {
  stance: string;
  count: number;
}

const STANCE_CONFIG = {
  support: { 
    icon: ThumbsUp, 
    label: 'Stöd', 
    bgColor: 'bg-primary/10', 
    textColor: 'text-primary',
    barColor: 'bg-primary' 
  },
  oppose: { 
    icon: ThumbsDown, 
    label: 'Mot', 
    bgColor: 'bg-destructive/10', 
    textColor: 'text-destructive',
    barColor: 'bg-destructive' 
  },
  conditional: { 
    icon: Scale, 
    label: 'Villkorat', 
    bgColor: 'bg-accent', 
    textColor: 'text-accent-foreground',
    barColor: 'bg-accent-foreground' 
  },
  neutral: { 
    icon: Minus, 
    label: 'Neutral', 
    bgColor: 'bg-muted', 
    textColor: 'text-muted-foreground',
    barColor: 'bg-muted-foreground' 
  },
  mixed: { 
    icon: HelpCircle, 
    label: 'Blandad', 
    bgColor: 'bg-secondary', 
    textColor: 'text-secondary-foreground',
    barColor: 'bg-secondary-foreground' 
  },
  no_position: { 
    icon: FileText, 
    label: 'Ingen ställning', 
    bgColor: 'bg-muted/50', 
    textColor: 'text-muted-foreground',
    barColor: 'bg-muted-foreground/50' 
  },
} as const;

// Define the order for display
const STANCE_ORDER: (keyof typeof STANCE_CONFIG)[] = [
  'support', 
  'conditional', 
  'neutral', 
  'oppose', 
  'mixed', 
  'no_position'
];

export function StanceDistributionWidget() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['stance-distribution'],
    queryFn: async () => {
      // Fetch counts for each stance_summary value
      // We need to paginate to get accurate counts beyond 1000
      const PAGE_SIZE = 1000;
      const stanceCounts: Record<string, number> = {};
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: rows, error } = await supabase
          .from('remiss_responses')
          .select('stance_summary')
          .eq('extraction_status', 'ok')
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error) throw error;

        if (!rows || rows.length === 0) {
          hasMore = false;
        } else {
          for (const row of rows) {
            const stance = row.stance_summary || 'unknown';
            stanceCounts[stance] = (stanceCounts[stance] || 0) + 1;
          }
          hasMore = rows.length === PAGE_SIZE;
          page++;
        }
      }

      // Convert to array and calculate totals
      const total = Object.values(stanceCounts).reduce((sum, c) => sum + c, 0);
      
      return {
        counts: stanceCounts,
        total,
      };
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Kunde inte ladda ställningsfördelning
        </CardContent>
      </Card>
    );
  }

  const { counts, total } = data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieChart className="h-5 w-5 text-primary" />
          Ställningsfördelning
        </CardTitle>
        <CardDescription>
          Hur organisationer ställer sig till lagförslagen ({total.toLocaleString()} remissvar)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {STANCE_ORDER.map(stanceKey => {
            const config = STANCE_CONFIG[stanceKey];
            const count = counts[stanceKey] || 0;
            const percentage = total > 0 ? (count / total) * 100 : 0;
            const Icon = config.icon;

            return (
              <div key={stanceKey} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${config.textColor}`} />
                    <span className="font-medium">{config.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className={config.bgColor}>
                      {count.toLocaleString()}
                    </Badge>
                    <span className="text-muted-foreground w-12 text-right">
                      {percentage.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div 
                    className={`h-full ${config.barColor} transition-all duration-500`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Unknown/unprocessed count if any */}
        {counts['unknown'] && counts['unknown'] > 0 && (
          <div className="mt-4 pt-3 border-t text-sm text-muted-foreground">
            {counts['unknown'].toLocaleString()} remissvar utan analyserad ställning
          </div>
        )}
      </CardContent>
    </Card>
  );
}
