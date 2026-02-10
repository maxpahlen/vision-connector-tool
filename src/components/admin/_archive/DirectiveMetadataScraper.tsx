import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Users, CheckCircle, XCircle, FileText } from 'lucide-react';

interface DirectiveDetail {
  directiveNumber: string;
  docNumber: string;
  utredare: string | null;
  sekreterare: string[];
  redovisningsdatum: string | null;
  matched: boolean;
  updated: boolean;
  documentId?: string;
}

interface ScrapeResults {
  total: number;
  matched: number;
  updated: number;
  not_found: string[];
  details: DirectiveDetail[];
}

export function DirectiveMetadataScraper() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [pageType, setPageType] = useState<'pagaende' | 'avslutade'>('pagaende');
  const [dryRun, setDryRun] = useState(true);
  const [results, setResults] = useState<ScrapeResults | null>(null);

  const handleScrape = async () => {
    setIsLoading(true);
    setResults(null);

    try {
      const { data, error } = await supabase.functions.invoke('scrape-directive-metadata', {
        body: { page_type: pageType, dry_run: dryRun },
      });

      if (error) throw error;

      if (data.success) {
        setResults(data.results);
        toast({
          title: dryRun ? 'Dry Run Complete' : 'Scrape Complete',
          description: `Found ${data.results.total} directives, ${data.results.matched} matched, ${data.results.updated} updated`,
        });
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error) {
      console.error('Scrape error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to scrape directives',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Directive Metadata Scraper
        </CardTitle>
        <CardDescription>
          Extract contact metadata (utredare, sekreterare, etc.) from sou.gov.se accordion sections
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-2">
            <Label>Page Type</Label>
            <Select value={pageType} onValueChange={(v) => setPageType(v as 'pagaende' | 'avslutade')}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pagaende">Pågående utredningar</SelectItem>
                <SelectItem value="avslutade">Avslutade utredningar</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="dry-run"
              checked={dryRun}
              onCheckedChange={setDryRun}
            />
            <Label htmlFor="dry-run">Dry Run</Label>
          </div>

          <Button onClick={handleScrape} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {dryRun ? 'Preview Scrape' : 'Scrape & Update'}
          </Button>
        </div>

        {results && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-2xl font-bold">{results.total}</div>
                <div className="text-xs text-muted-foreground">Total Found</div>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-green-600">{results.matched}</div>
                <div className="text-xs text-muted-foreground">Matched in DB</div>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-blue-600">{results.updated}</div>
                <div className="text-xs text-muted-foreground">Updated</div>
              </div>
              <div className="bg-muted rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-orange-600">{results.not_found.length}</div>
                <div className="text-xs text-muted-foreground">Not in DB</div>
              </div>
            </div>

            {/* Details */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">Directive</th>
                    <th className="text-left p-2">Utredare</th>
                    <th className="text-left p-2">Sekreterare</th>
                    <th className="text-center p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.details.slice(0, 20).map((detail, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2">
                        <div className="font-medium">{detail.directiveNumber}</div>
                        <div className="text-xs text-muted-foreground">{detail.docNumber}</div>
                      </td>
                      <td className="p-2">
                        {detail.utredare || <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-2">
                        {detail.sekreterare.length > 0 ? (
                          <span>{detail.sekreterare.length} person(s)</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {detail.matched ? (
                          detail.updated ? (
                            <Badge variant="default" className="bg-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Updated
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <FileText className="h-3 w-3 mr-1" />
                              Matched
                            </Badge>
                          )
                        ) : (
                          <Badge variant="outline">
                            <XCircle className="h-3 w-3 mr-1" />
                            Not Found
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {results.details.length > 20 && (
                <div className="p-2 text-center text-sm text-muted-foreground bg-muted">
                  Showing 20 of {results.details.length} results
                </div>
              )}
            </div>

            {/* Not Found List */}
            {results.not_found.length > 0 && (
              <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
                <div className="font-medium text-orange-800 dark:text-orange-200 mb-2">
                  Directives not in database ({results.not_found.length}):
                </div>
                <div className="text-sm text-orange-700 dark:text-orange-300 flex flex-wrap gap-2">
                  {results.not_found.map((docNum, idx) => (
                    <Badge key={idx} variant="outline" className="text-orange-700">
                      {docNum}
                    </Badge>
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
