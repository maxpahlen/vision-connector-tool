import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { PlayCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function ScraperControls() {
  const [loading, setLoading] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);

  const handleScrapeIndex = async (pageTypes: string[], maxPages?: number) => {
    const key = pageTypes.join('-');
    setLoading(key);
    toast.info(`Starting scrape of ${pageTypes.join(' and ')} pages${maxPages ? ` (max ${maxPages} pages)` : ''}...`);

    try {
      const body = maxPages ? { pageTypes, maxPages } : { pageTypes };
      const { data, error } = await supabase.functions.invoke('scrape-sou-index', {
        body,
      });

      if (error) throw error;

      setLastResult(data);
      toast.success(
        `Scrape complete: ${data.processesCreated} created, ${data.processesUpdated} updated, ${data.tasksCreated} tasks created`
      );
    } catch (error: any) {
      toast.error(`Scrape failed: ${error.message}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scraper Controls</CardTitle>
        <CardDescription>
          Trigger index scraper to discover and create processing tasks
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Button
            onClick={() => handleScrapeIndex(['pagaende'], 10)}
            disabled={loading !== null}
          >
            {loading === 'pagaende' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4 mr-2" />
            )}
            Scrape Ongoing
          </Button>
          <Button
            onClick={() => handleScrapeIndex(['avslutade'])}
            disabled={loading !== null}
          >
            {loading === 'avslutade' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4 mr-2" />
            )}
            Scrape Completed
          </Button>
          <Button
            onClick={() => handleScrapeIndex(['pagaende', 'avslutade'])}
            disabled={loading !== null}
          >
            {loading === 'pagaende-avslutade' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4 mr-2" />
            )}
            Scrape Both
          </Button>
        </div>

        {lastResult && (
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            <h4 className="text-sm font-medium">Last Scrape Result</h4>
            <div className="flex gap-2 text-sm">
              <Badge variant="default">{lastResult.processesCreated} Created</Badge>
              <Badge variant="secondary">{lastResult.processesUpdated} Updated</Badge>
              <Badge variant="outline">{lastResult.tasksCreated} Tasks Created</Badge>
            </div>
            {lastResult.errors && lastResult.errors.length > 0 && (
              <div className="text-xs text-destructive">
                {lastResult.errors.length} errors occurred
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
