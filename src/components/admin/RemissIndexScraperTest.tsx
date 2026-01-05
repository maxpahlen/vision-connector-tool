import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Play, CheckCircle, AlertCircle, FileQuestion, Link } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface MatchedRemiss {
  remiss_url: string;
  title: string;
  publication_date: string | null;
  matched_document: {
    id: string;
    doc_number: string;
    title: string;
  };
  sou_references: string[];
  dir_references: string[];
}

interface OrphanRemiss {
  remiss_url: string;
  title: string;
  publication_date: string | null;
  sou_references: string[];
  dir_references: string[];
  reason: string;
}

interface ScrapeResult {
  success: boolean;
  summary: {
    pages_scraped: number;
    total_listings: number;
    matched: number;
    orphaned: number;
    errors: number;
    inserted: number;
    skipped_duplicates: number;
  };
  matched: MatchedRemiss[];
  orphan: OrphanRemiss[];
  errors: string[];
}

export function RemissIndexScraperTest() {
  const [isLoading, setIsLoading] = useState(false);
  const [startPage, setStartPage] = useState(1);
  const [maxPages, setMaxPages] = useState(5);
  const [dryRun, setDryRun] = useState(true);
  const [result, setResult] = useState<ScrapeResult | null>(null);

  const runScraper = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('scrape-remiss-index', {
        body: {
          page: startPage,
          max_pages: maxPages,
          dry_run: dryRun
        }
      });

      if (error) {
        throw error;
      }

      setResult(data as ScrapeResult);
      
      if (data.success) {
        toast.success(
          `Scraped ${data.summary.pages_scraped} pages: ${data.summary.matched} matched, ${data.summary.orphaned} orphaned`
        );
      } else {
        toast.error('Scrape completed with errors');
      }
    } catch (error) {
      console.error('Remiss index scraper error:', error);
      toast.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link className="h-5 w-5" />
          Remiss Index Scraper (Primary)
        </CardTitle>
        <CardDescription>
          Scrape regeringen.se/remisser and match to SOUs/Directives by title parsing.
          This is the primary remiss discovery method.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="startPage">Start Page</Label>
            <Input
              id="startPage"
              type="number"
              min={1}
              value={startPage}
              onChange={(e) => setStartPage(parseInt(e.target.value) || 1)}
              className="w-24"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="maxPages">Max Pages</Label>
            <Input
              id="maxPages"
              type="number"
              min={1}
              max={50}
              value={maxPages}
              onChange={(e) => setMaxPages(parseInt(e.target.value) || 5)}
              className="w-24"
            />
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="dryRun"
              checked={dryRun}
              onCheckedChange={(checked) => setDryRun(checked === true)}
            />
            <Label htmlFor="dryRun" className="cursor-pointer">
              Dry Run (preview only, no DB writes)
            </Label>
          </div>
          <Button onClick={runScraper} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Scraping...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run Scraper
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {result && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
              <div className="bg-muted p-3 rounded-lg text-center">
                <div className="text-2xl font-bold">{result.summary?.pages_scraped ?? 0}</div>
                <div className="text-xs text-muted-foreground">Pages Scraped</div>
              </div>
              <div className="bg-muted p-3 rounded-lg text-center">
                <div className="text-2xl font-bold">{result.summary?.total_listings ?? 0}</div>
                <div className="text-xs text-muted-foreground">Total Listings</div>
              </div>
              <div className="bg-primary/10 p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-primary">{result.summary?.matched ?? 0}</div>
                <div className="text-xs text-muted-foreground">Matched</div>
              </div>
              <div className="bg-muted p-3 rounded-lg text-center">
                <div className="text-2xl font-bold">{result.summary?.orphaned ?? 0}</div>
                <div className="text-xs text-muted-foreground">Orphaned</div>
              </div>
              {!dryRun && (
                <>
                  <div className="bg-primary/10 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold text-primary">{result.summary?.inserted ?? 0}</div>
                    <div className="text-xs text-muted-foreground">Inserted</div>
                  </div>
                  <div className="bg-muted p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold">{result.summary?.skipped_duplicates ?? 0}</div>
                    <div className="text-xs text-muted-foreground">Duplicates</div>
                  </div>
                </>
              )}
              {(result.summary?.errors ?? 0) > 0 && (
                <div className="bg-destructive/10 p-3 rounded-lg text-center">
                  <div className="text-2xl font-bold text-destructive">{result.summary?.errors ?? 0}</div>
                  <div className="text-xs text-muted-foreground">Errors</div>
                </div>
              )}
            </div>

            {/* Mode indicator */}
            {dryRun && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-sm text-yellow-700 dark:text-yellow-400">
                <strong>Dry Run Mode:</strong> No data was written to the database. 
                Uncheck "Dry Run" and run again to save results.
              </div>
            )}

            {/* Tabs for matched/orphan */}
            <Tabs defaultValue="matched" className="w-full">
              <TabsList>
                <TabsTrigger value="matched" className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Matched ({result.matched?.length ?? 0})
                </TabsTrigger>
                <TabsTrigger value="orphan" className="flex items-center gap-2">
                  <FileQuestion className="h-4 w-4" />
                  Orphaned ({result.orphan?.length ?? 0})
                </TabsTrigger>
                {(result.errors?.length ?? 0) > 0 && (
                  <TabsTrigger value="errors" className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Errors ({result.errors?.length ?? 0})
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="matched" className="mt-4">
                {(result.matched?.length ?? 0) === 0 ? (
                  <p className="text-muted-foreground text-sm">No matched remisser found.</p>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Matched Document</TableHead>
                          <TableHead>References</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(result.matched ?? []).slice(0, 50).map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="max-w-xs">
                              <a 
                                href={item.remiss_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary hover:underline text-sm"
                              >
                                {(item.title?.length ?? 0) > 60 ? item.title.slice(0, 60) + '...' : item.title}
                              </a>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {item.matched_document?.doc_number ?? 'Unknown'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {(item.sou_references ?? []).map((ref, i) => (
                                  <Badge key={`sou-${i}`} variant="secondary" className="text-xs">
                                    {ref}
                                  </Badge>
                                ))}
                                {(item.dir_references ?? []).map((ref, i) => (
                                  <Badge key={`dir-${i}`} variant="outline" className="text-xs">
                                    {ref}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {item.publication_date || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {(result.matched?.length ?? 0) > 50 && (
                      <div className="p-2 text-center text-sm text-muted-foreground bg-muted">
                        Showing first 50 of {result.matched?.length ?? 0} matched remisser
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="orphan" className="mt-4">
                {(result.orphan?.length ?? 0) === 0 ? (
                  <p className="text-muted-foreground text-sm">No orphaned remisser found.</p>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Title</TableHead>
                          <TableHead>Extracted References</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(result.orphan ?? []).slice(0, 50).map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="max-w-xs">
                              <a 
                                href={item.remiss_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-primary hover:underline text-sm"
                              >
                                {(item.title?.length ?? 0) > 60 ? item.title.slice(0, 60) + '...' : item.title}
                              </a>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {(item.sou_references ?? []).map((ref, i) => (
                                  <Badge key={`sou-${i}`} variant="secondary" className="text-xs">
                                    {ref}
                                  </Badge>
                                ))}
                                {(item.dir_references ?? []).map((ref, i) => (
                                  <Badge key={`dir-${i}`} variant="outline" className="text-xs">
                                    {ref}
                                  </Badge>
                                ))}
                                {(item.sou_references?.length ?? 0) === 0 && (item.dir_references?.length ?? 0) === 0 && (
                                  <span className="text-muted-foreground text-xs">None</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-muted-foreground text-xs">{item.reason}</span>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {item.publication_date || '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {(result.orphan?.length ?? 0) > 50 && (
                      <div className="p-2 text-center text-sm text-muted-foreground bg-muted">
                        Showing first 50 of {result.orphan?.length ?? 0} orphaned remisser
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              {(result.errors?.length ?? 0) > 0 && (
                <TabsContent value="errors" className="mt-4">
                  <div className="space-y-2">
                    {(result.errors ?? []).map((err, idx) => (
                      <div key={idx} className="bg-destructive/10 p-2 rounded text-sm text-destructive">
                        {err}
                      </div>
                    ))}
                  </div>
                </TabsContent>
              )}
            </Tabs>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
