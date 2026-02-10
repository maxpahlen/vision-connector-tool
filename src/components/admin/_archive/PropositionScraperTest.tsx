import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, FileText, Link, AlertCircle, CheckCircle } from 'lucide-react';

interface PropositionResult {
  title: string;
  docNumber: string;
  url: string;
  pdfUrl?: string;
  ministry?: string;
  publicationDate?: string;
}

interface ScrapeResult {
  propositions: PropositionResult[];
  page: number;
  hasMore: boolean;
  inserted: number;
  skippedExistingInDb: number;
  skippedDuplicateInPage: number;
  references_created: number;
  errors: string[];
}

export function PropositionScraperTest() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(5);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ScrapeResult | null>(null);

  const runScraper = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('scrape-proposition-index', {
        body: { page, limit, skipExisting: true }
      });

      if (error) throw error;

      setResult(data);
      
      if (data.inserted > 0) {
        toast.success(`Scraped ${data.inserted} propositions, created ${data.references_created} references`);
      } else if (data.skippedExistingInDb > 0) {
        toast.info(`All ${data.skippedExistingInDb} propositions already exist in DB`);
      } else if (data.skippedDuplicateInPage > 0) {
        toast.warning(`Found ${data.skippedDuplicateInPage} duplicates in page HTML`);
      } else {
        toast.warning('No propositions found on this page');
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
          <FileText className="h-5 w-5" />
          Proposition Scraper (Phase 5.2)
        </CardTitle>
        <CardDescription>
          Scrape propositions from regeringen.se/rattsliga-dokument/proposition/
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="page">Page</Label>
            <Input
              id="page"
              type="number"
              min={1}
              value={page}
              onChange={(e) => setPage(parseInt(e.target.value) || 1)}
              className="w-20"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="limit">Limit</Label>
            <Input
              id="limit"
              type="number"
              min={1}
              max={20}
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
                DB Exists: {result.skippedExistingInDb}
              </Badge>
              {result.skippedDuplicateInPage > 0 && (
                <Badge variant="outline" className="text-amber-600 border-amber-400">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Page Dupes: {result.skippedDuplicateInPage}
                </Badge>
              )}
              <Badge variant="outline">
                <Link className="h-3 w-3 mr-1" />
                References: {result.references_created}
              </Badge>
              {result.hasMore && (
                <Badge variant="outline">More pages available</Badge>
              )}
              {result.errors.length > 0 && (
                <Badge variant="destructive">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Errors: {result.errors.length}
                </Badge>
              )}
            </div>

            {/* Inserted propositions */}
            {result.propositions.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Inserted Propositions</h4>
                <div className="space-y-2">
                  {result.propositions.map((prop, idx) => (
                    <div key={idx} className="p-3 bg-muted rounded-lg text-sm">
                      <div className="font-medium">{prop.docNumber}</div>
                      <div className="text-muted-foreground truncate">{prop.title}</div>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {prop.ministry && (
                          <Badge variant="outline" className="text-xs">{prop.ministry}</Badge>
                        )}
                        {prop.publicationDate && (
                          <Badge variant="outline" className="text-xs">{prop.publicationDate}</Badge>
                        )}
                        {prop.pdfUrl && (
                          <Badge variant="outline" className="text-xs">
                            <Link className="h-3 w-3 mr-1" />
                            PDF
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Errors */}
            {result.errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-destructive">Errors</h4>
                <div className="space-y-1">
                  {result.errors.map((err, idx) => (
                    <div key={idx} className="text-xs text-destructive bg-destructive/10 p-2 rounded">
                      {err}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next page button */}
            {result.hasMore && (
              <Button 
                variant="outline" 
                onClick={() => setPage(p => p + 1)}
                className="w-full"
              >
                Load Page {page + 1}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
