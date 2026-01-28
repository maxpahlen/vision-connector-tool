import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Scale, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const YEARS = ['2024', '2023', '2022', '2021', '2020'];

interface ScrapeResult {
  success: boolean;
  year?: string;
  totalAvailable?: number;
  totalPages?: number;
  currentPage?: number;
  processed: number;
  inserted?: number;
  skipped?: number;
  textExtracted?: number;
  updated?: number;
  backfill?: boolean;
  message?: string;
  errors: string[];
}

export function LawsScraperTest() {
  const [year, setYear] = useState('2024');
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);
  const [fetchText, setFetchText] = useState(true);
  const [backfillLimit, setBackfillLimit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);

  const handleScrape = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('scrape-laws', {
        body: { year, limit, page, fetchText }
      });

      if (error) throw error;

      setResult(data as ScrapeResult);
      
      if (data.inserted > 0) {
        toast.success(`Inserted ${data.inserted} laws`);
      } else if (data.skipped > 0) {
        toast.info(`All ${data.skipped} laws already exist`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Scrape failed: ${msg}`);
      console.error('Scrape error:', error);
    } finally { setLoading(false); }
  };

  const handleBackfill = async () => {
    setBackfillLoading(true);
    setResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('scrape-laws', {
        body: { backfill: true, limit: backfillLimit }
      });

      if (error) throw error;

      setResult(data as ScrapeResult);
      
      if (data.updated > 0) {
        toast.success(`Updated text for ${data.updated} laws`);
      } else {
        toast.info(data.message || 'No laws needed text backfill');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Backfill failed: ${msg}`);
      console.error('Backfill error:', error);
    } finally { setBackfillLoading(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5" />
          Laws Scraper (SFS)
        </CardTitle>
        <CardDescription>
          Scrape Swedish laws (Svensk Författningssamling) from riksdagen.se API
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Year</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Limit</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value) || 10)}
            />
          </div>
          <div className="space-y-2">
            <Label>Page</Label>
            <Input
              type="number"
              min={1}
              value={page}
              onChange={(e) => setPage(parseInt(e.target.value) || 1)}
            />
          </div>
          <div className="space-y-2">
            <Label>Fetch Text</Label>
            <div className="flex items-center h-10">
              <Switch checked={fetchText} onCheckedChange={setFetchText} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Button onClick={handleScrape} disabled={loading || backfillLoading} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {loading ? 'Scraping...' : 'Scrape Laws (SFS)'}
          </Button>
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              max={100}
              value={backfillLimit}
              onChange={(e) => setBackfillLimit(parseInt(e.target.value) || 20)}
              className="w-20"
              placeholder="Limit"
            />
            <Button onClick={handleBackfill} disabled={loading || backfillLoading} variant="secondary" className="flex-1">
              {backfillLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {backfillLoading ? 'Backfilling...' : 'Backfill Text'}
            </Button>
          </div>
        </div>

        {result && (
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Year:</span>{' '}
                <span className="font-medium">{result.year}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Total Available:</span>{' '}
                <span className="font-medium">{result.totalAvailable}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Page:</span>{' '}
                <span className="font-medium">{result.currentPage} / {result.totalPages}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Processed:</span>{' '}
                <span className="font-medium">{result.processed}</span>
              </div>
            </div>

            <div className={`grid gap-2 ${result.backfill ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {result.backfill ? (
                <>
                  <div className="rounded bg-background p-2 text-center">
                    <div className="text-2xl font-bold text-green-600">{result.updated}</div>
                    <div className="text-xs text-muted-foreground">Updated</div>
                  </div>
                  <div className="rounded bg-background p-2 text-center">
                    <div className="text-2xl font-bold text-muted-foreground">{result.processed}</div>
                    <div className="text-xs text-muted-foreground">Processed</div>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded bg-background p-2 text-center">
                    <div className="text-2xl font-bold text-green-600">{result.inserted}</div>
                    <div className="text-xs text-muted-foreground">Inserted</div>
                  </div>
                  <div className="rounded bg-background p-2 text-center">
                    <div className="text-2xl font-bold text-yellow-600">{result.skipped}</div>
                    <div className="text-xs text-muted-foreground">Skipped</div>
                  </div>
                  <div className="rounded bg-background p-2 text-center">
                    <div className="text-2xl font-bold text-blue-600">{result.textExtracted}</div>
                    <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                      <FileText className="h-3 w-3" /> Text
                    </div>
                  </div>
                </>
              )}
            </div>

            {result.errors.length > 0 && (
              <div className="text-sm">
                <div className="font-medium text-destructive mb-1">Errors ({result.errors.length}):</div>
                <div className="max-h-24 overflow-auto text-xs text-muted-foreground bg-background rounded p-2">
                  {result.errors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
