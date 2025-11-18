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

  const handleScrapeIndex = async (pageTypes: string[]) => {
    const key = pageTypes.join('-');
    setLoading(key);
    toast.info(`Starting scrape of ${pageTypes.join(' and ')} pages...`);

    try {
      const { data, error } = await supabase.functions.invoke('scrape-sou-index', {
        body: { pageTypes },
      });

      if (error) throw error;

      setLastResult(data);
      
      // Show detailed pagination stats if available
      const statsMessage = data.pagesProcessed 
        ? `Scrape complete: ${data.pagesProcessed} pages, ${data.validEntriesProcessed} entries processed, ${data.tasksCreated} tasks created. Stop reason: ${data.stopReason}`
        : `Scrape complete: ${data.processesCreated} created, ${data.tasksCreated} tasks created`;
      
      toast.success(statsMessage);
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
            onClick={() => handleScrapeIndex(['pagaende'])}
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
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <h4 className="text-sm font-medium">Last Scrape Result</h4>
            
            {/* Pagination Stats - Only show if available */}
            {lastResult.pagesProcessed !== undefined && (
              <div className="space-y-2 pb-2 border-b">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Pages Processed</div>
                    <div className="font-medium">{lastResult.pagesProcessed}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Entries Scanned</div>
                    <div className="font-medium">{lastResult.totalEntriesScanned}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Valid Entries</div>
                    <div className="font-medium">{lastResult.validEntriesProcessed}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Stop Reason</div>
                    <Badge variant="outline" className="text-xs">
                      {lastResult.stopReason || 'N/A'}
                    </Badge>
                  </div>
                </div>
              </div>
            )}
            
            {/* Standard Stats */}
            <div className="flex gap-2 text-sm flex-wrap">
              <Badge variant="default">{lastResult.processesCreated} Processes</Badge>
              <Badge variant="secondary">{lastResult.tasksCreated} Tasks Created</Badge>
              {lastResult.errors && lastResult.errors.length > 0 && (
                <Badge variant="destructive">{lastResult.errors.length} Errors</Badge>
              )}
            </div>
            
            {lastResult.errors && lastResult.errors.length > 0 && (
              <div className="text-xs text-destructive space-y-1">
                <div className="font-medium">Errors:</div>
                {lastResult.errors.slice(0, 3).map((err: string, i: number) => (
                  <div key={i} className="text-xs truncate">{err}</div>
                ))}
                {lastResult.errors.length > 3 && (
                  <div className="text-xs">... and {lastResult.errors.length - 3} more</div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
