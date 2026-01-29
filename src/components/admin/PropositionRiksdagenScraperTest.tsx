import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, FileText, Link, AlertCircle, CheckCircle, Database } from 'lucide-react';

interface ScrapeResult {
  session: string;
  totalAvailable: number;
  totalPages: number;
  currentPage: number;
  processed: number;
  inserted: number;
  skipped: number;
  refsCreated: number;
  eventsCreated: number;
  errors: string[];
}

const SESSIONS = [
  '2024/25', '2023/24', '2022/23', '2021/22', '2020/21',
  '2019/20', '2018/19', '2017/18', '2016/17', '2015/16',
  '2014/15', '2013/14', '2012/13', '2011/12', '2010/11'
];

export function PropositionRiksdagenScraperTest() {
  const [session, setSession] = useState('2024/25');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);

  const runScraper = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('scrape-propositions-riksdagen', {
        body: { session, page, limit }
      });

      if (error) throw error;

      setResult(data);
      
      if (data.inserted > 0) {
        toast.success(`Inserted ${data.inserted} propositions, ${data.refsCreated} refs, ${data.eventsCreated} events`);
      } else if (data.skipped > 0) {
        toast.info(`All ${data.skipped} propositions already exist`);
      } else {
        toast.warning('No propositions found');
      }
    } catch (error) {
      console.error('Scraper error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to run scraper');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Proposition Scraper (Riksdagen API)
        </CardTitle>
        <CardDescription>
          Phase 6.1 - Scrape propositions from data.riksdagen.se Open Data API
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex gap-4 items-end flex-wrap">
          <div className="space-y-2">
            <Label>Session</Label>
            <Select value={session} onValueChange={setSession}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SESSIONS.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prop-page">Page</Label>
            <Input
              id="prop-page"
              type="number"
              min={1}
              value={page}
              onChange={(e) => setPage(parseInt(e.target.value) || 1)}
              className="w-20"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prop-limit">Limit</Label>
            <Input
              id="prop-limit"
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value) || 5)}
              className="w-20"
            />
          </div>
          <Button onClick={runScraper} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scraping...
              </>
            ) : (
              'Run Scraper'
            )}
          </Button>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-4 mt-4">
            {/* Summary */}
            <div className="flex gap-2 flex-wrap">
              <Badge variant="default">
                <CheckCircle className="h-3 w-3 mr-1" />
                Inserted: {result.inserted}
              </Badge>
              <Badge variant="secondary">
                Skipped: {result.skipped}
              </Badge>
              <Badge variant="outline">
                <Link className="h-3 w-3 mr-1" />
                Refs: {result.refsCreated}
              </Badge>
              <Badge variant="outline">
                <FileText className="h-3 w-3 mr-1" />
                Events: {result.eventsCreated}
              </Badge>
              <Badge variant="outline">
                Total: {result.totalAvailable}
              </Badge>
              <Badge variant="outline">
                Page {result.currentPage}/{result.totalPages}
              </Badge>
              {result.errors.length > 0 && (
                <Badge variant="destructive">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Errors: {result.errors.length}
                </Badge>
              )}
            </div>

            {/* Progress info */}
            <div className="text-sm text-muted-foreground">
              Processed {result.processed} of {result.totalAvailable} available propositions in session {result.session}
            </div>

            {/* Errors */}
            {result.errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-destructive">Errors</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.map((err, idx) => (
                    <div key={idx} className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                      {err}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next page button */}
            {result.currentPage < result.totalPages && (
              <Button 
                variant="outline" 
                onClick={() => setPage(p => p + 1)}
                className="w-full"
              >
                Load Page {result.currentPage + 1}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
