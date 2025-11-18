import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { PlayCircle, Loader2, Database } from 'lucide-react';
import { toast } from 'sonner';

export function ScraperControls() {
  const [loading, setLoading] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<any>(null);
  const [showHistoryConfirm, setShowHistoryConfirm] = useState(false);

  const handleScrapeIndex = async (config: { pageTypes: string[], minCompletionYear?: number | null }) => {
    const key = config.pageTypes.join('-') + (config.minCompletionYear !== undefined ? `-${config.minCompletionYear}` : '');
    setLoading(key);
    
    const mode = config.minCompletionYear !== null && config.minCompletionYear !== undefined
      ? `${config.pageTypes.join(' and ')} (${config.minCompletionYear}+)`
      : `${config.pageTypes.join(' and ')} (full history)`;
    
    toast.info(`Starting scrape: ${mode}`);

    try {
      const { data, error } = await supabase.functions.invoke('scrape-sou-index', {
        body: config,
      });

      if (error) throw error;

      setLastResult(data);
      
      // Show detailed stats with mode indicator
      const modeDisplay = data.mode ? `[${data.mode}] ` : '';
      const statsMessage = data.pagesProcessed 
        ? `${modeDisplay}${data.pagesProcessed} pages, ${data.validEntriesProcessed} entries, ${data.tasksCreated} tasks created. Stop: ${data.stopReason}`
        : `${modeDisplay}${data.processesCreated} processes, ${data.tasksCreated} tasks created`;
      
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
          Index scraper for sou.gov.se - defaults to safe throttled mode (2023+)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Primary Actions - Safe Defaults */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Primary Actions (Safe)</h4>
          <div className="grid gap-3 md:grid-cols-2">
            <Button
              onClick={() => handleScrapeIndex({ pageTypes: ['avslutade'], minCompletionYear: 2023 })}
              disabled={loading !== null}
              variant="default"
            >
              {loading === 'avslutade-2023' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4 mr-2" />
              )}
              Scrape Avslutade (2023+)
            </Button>
            <Button
              onClick={() => handleScrapeIndex({ pageTypes: ['pagaende'] })}
              disabled={loading !== null}
              variant="default"
            >
              {loading === 'pagaende' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <PlayCircle className="h-4 w-4 mr-2" />
              )}
              Scrape Pågående (All)
            </Button>
          </div>
        </div>
        
        {/* Advanced Action - Full History */}
        <div className="space-y-2 pt-2 border-t">
          <h4 className="text-sm font-medium text-muted-foreground">Advanced (Full Historical Backfill)</h4>
          <Button
            onClick={() => setShowHistoryConfirm(true)}
            disabled={loading !== null}
            variant="outline"
            className="w-full"
          >
            {loading === 'avslutade-null' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Database className="h-4 w-4 mr-2" />
            )}
            Scrape All History (Avslutade)
          </Button>
        </div>

        {lastResult && (
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Last Scrape Result</h4>
              {lastResult.mode && (
                <Badge variant="secondary" className="text-xs">
                  {lastResult.mode}
                </Badge>
              )}
            </div>
            
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
                
                {/* Missing Completion Code Warning */}
                {lastResult.missingCompletionCodeCount > 0 && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 space-y-1 pt-2">
                    <div className="font-medium">
                      ⚠️ {lastResult.missingCompletionCodeCount} entries without completion code
                    </div>
                    {lastResult.missingCompletionCodeExamples && lastResult.missingCompletionCodeExamples.length > 0 && (
                      <div className="text-xs opacity-80">
                        Examples: {lastResult.missingCompletionCodeExamples.join(', ')}
                      </div>
                    )}
                  </div>
                )}
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
      
      {/* Confirmation Dialog for Full History Scrape */}
      <AlertDialog open={showHistoryConfirm} onOpenChange={setShowHistoryConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Scrape Full Historical Data?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This will index <strong>all inquiries</strong> from sou.gov.se with no year limit,
                potentially processing hundreds or thousands of entries across many pages.
              </p>
              <p className="text-sm text-muted-foreground">
                This is a full historical backfill operation. Use this when the system is ready
                for complete data coverage.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowHistoryConfirm(false);
                handleScrapeIndex({ pageTypes: ['avslutade'], minCompletionYear: null });
              }}
            >
              Proceed with Full History Scrape
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
