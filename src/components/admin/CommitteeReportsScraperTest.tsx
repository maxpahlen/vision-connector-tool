import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, FileText, Link2, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const SESSIONS = [
  '2024/25',
  '2023/24',
  '2022/23',
  '2021/22',
  '2020/21',
];

interface ScrapeResult {
  success: boolean;
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

export function CommitteeReportsScraperTest() {
  const [session, setSession] = useState('2024/25');
  const [limit, setLimit] = useState(10);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);

  const handleScrape = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('scrape-committee-reports', {
        body: { session, limit, page }
      });

      if (error) throw error;

      setResult(data as ScrapeResult);
      
      if (data.inserted > 0) {
        toast.success(`Inserted ${data.inserted} committee reports`);
      } else if (data.skipped > 0) {
        toast.info(`All ${data.skipped} documents already exist`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Scrape failed: ${msg}`);
      console.error('Scrape error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Committee Reports Scraper (Betänkanden)
        </CardTitle>
        <CardDescription>
          Scrape committee reports from riksdagen.se API with proposition cross-references and timeline events
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Riksmöte (Session)</Label>
            <Select value={session} onValueChange={setSession}>
              <SelectTrigger>
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
        </div>

        <Button onClick={handleScrape} disabled={loading} className="w-full">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {loading ? 'Scraping...' : 'Scrape Committee Reports'}
        </Button>

        {result && (
          <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Session:</span>{' '}
                <span className="font-medium">{result.session}</span>
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

            <div className="grid grid-cols-4 gap-2">
              <div className="rounded bg-background p-2 text-center">
                <div className="text-2xl font-bold text-green-600">{result.inserted}</div>
                <div className="text-xs text-muted-foreground">Inserted</div>
              </div>
              <div className="rounded bg-background p-2 text-center">
                <div className="text-2xl font-bold text-yellow-600">{result.skipped}</div>
                <div className="text-xs text-muted-foreground">Skipped</div>
              </div>
              <div className="rounded bg-background p-2 text-center">
                <div className="text-2xl font-bold text-blue-600">{result.refsCreated}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Link2 className="h-3 w-3" /> Refs
                </div>
              </div>
              <div className="rounded bg-background p-2 text-center">
                <div className="text-2xl font-bold text-purple-600">{result.eventsCreated}</div>
                <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                  <Calendar className="h-3 w-3" /> Events
                </div>
              </div>
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
