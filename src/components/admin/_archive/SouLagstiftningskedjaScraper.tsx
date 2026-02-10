import { useState, useCallback } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Link2, CheckCircle, XCircle, RefreshCw } from "lucide-react";

interface ScrapingResult {
  doc_number: string;
  status: 'success' | 'error' | 'skipped';
  links_found: number;
  error?: string;
}

interface BatchStatus {
  total: number;
  processed: number;
  success: number;
  errors: number;
  total_links: number;
  results: ScrapingResult[];
}

export function SouLagstiftningskedjaScraper() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [batchSize, setBatchSize] = useState(10);
  const [status, setStatus] = useState<BatchStatus | null>(null);
  const [testResult, setTestResult] = useState<any>(null);

  const testSingleSou = async () => {
    setIsLoading(true);
    setTestResult(null);

    try {
      // Get a sample SOU with URL
      const { data: sou, error: fetchError } = await supabase
        .from('documents')
        .select('id, doc_number, url')
        .eq('doc_type', 'sou')
        .not('url', 'is', null)
        .limit(1)
        .single();

      if (fetchError || !sou) throw new Error('No SOU found with URL');

      const { data, error } = await supabase.functions.invoke('scrape-regeringen-document', {
        body: { url: sou.url },
      });

      if (error) throw error;

      setTestResult({
        doc_number: sou.doc_number,
        url: sou.url,
        lagstiftningskedja_links: data.lagstiftningskedja_links || 0,
        references_extracted: data.references_extracted || 0,
        metadata: data.metadata,
      });

      toast({
        title: "Test Complete",
        description: `Found ${data.lagstiftningskedja_links || 0} Lagstiftningskedja links for ${sou.doc_number}`,
      });
    } catch (err) {
      console.error('Test error:', err);
      toast({
        title: "Test Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const runBatchScrape = useCallback(async () => {
    setIsLoading(true);
    setStatus(null);

    try {
      // Get all SOUs with URLs
      const { data: sous, error: fetchError } = await supabase
        .from('documents')
        .select('id, doc_number, url')
        .eq('doc_type', 'sou')
        .not('url', 'is', null)
        .order('doc_number', { ascending: false })
        .limit(batchSize);

      if (fetchError) throw fetchError;
      if (!sous || sous.length === 0) {
        toast({ title: "No SOUs found", description: "No SOU documents with URLs to process" });
        return;
      }

      const batchStatus: BatchStatus = {
        total: sous.length,
        processed: 0,
        success: 0,
        errors: 0,
        total_links: 0,
        results: [],
      };
      setStatus(batchStatus);

      for (const sou of sous) {
        try {
          const { data, error } = await supabase.functions.invoke('scrape-regeringen-document', {
            body: { url: sou.url },
          });

          if (error) throw error;

          const linksFound = data.lagstiftningskedja_links || 0;
          batchStatus.success++;
          batchStatus.total_links += linksFound;
          batchStatus.results.push({
            doc_number: sou.doc_number,
            status: 'success',
            links_found: linksFound,
          });
        } catch (err) {
          batchStatus.errors++;
          batchStatus.results.push({
            doc_number: sou.doc_number,
            status: 'error',
            links_found: 0,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }

        batchStatus.processed++;
        setStatus({ ...batchStatus });
      }

      toast({
        title: "Batch Complete",
        description: `Processed ${batchStatus.processed} SOUs, found ${batchStatus.total_links} total links`,
      });
    } catch (err) {
      console.error('Batch error:', err);
      toast({
        title: "Batch Failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [batchSize, toast]);

  const progress = status ? (status.processed / status.total) * 100 : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          SOU Lagstiftningskedja Re-Scraper
        </CardTitle>
        <CardDescription>
          Re-scrape existing SOU documents to extract Lagstiftningskedja links and populate document_references
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Test Section */}
        <div className="border rounded-lg p-4 space-y-3">
          <h4 className="font-medium">1. Test Single SOU</h4>
          <Button onClick={testSingleSou} disabled={isLoading} variant="outline" size="sm">
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Test on Sample SOU
          </Button>
          
          {testResult && (
            <div className="text-sm space-y-2 bg-muted p-3 rounded">
              <p><strong>Document:</strong> {testResult.doc_number}</p>
              <p><strong>Links Found:</strong> {testResult.lagstiftningskedja_links}</p>
              <p><strong>References Created:</strong> {testResult.references_extracted}</p>
              {testResult.metadata?.lagstiftningskedja_links?.length > 0 && (
                <div className="mt-2">
                  <strong>Links:</strong>
                  <ul className="list-disc list-inside text-xs mt-1">
                    {testResult.metadata.lagstiftningskedja_links.slice(0, 5).map((link: any, i: number) => (
                      <li key={i} className="truncate">
                        <Badge variant="outline" className="mr-1">{link.docType}</Badge>
                        {link.anchorText}
                      </li>
                    ))}
                    {testResult.metadata.lagstiftningskedja_links.length > 5 && (
                      <li className="text-muted-foreground">
                        ... and {testResult.metadata.lagstiftningskedja_links.length - 5} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Batch Section */}
        <div className="border rounded-lg p-4 space-y-3">
          <h4 className="font-medium">2. Batch Re-Scrape</h4>
          <div className="flex items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="batch-size">Batch Size</Label>
              <Input
                id="batch-size"
                type="number"
                min={1}
                max={200}
                value={batchSize}
                onChange={(e) => setBatchSize(parseInt(e.target.value) || 10)}
                className="w-24"
              />
            </div>
            <Button onClick={runBatchScrape} disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <RefreshCw className="mr-2 h-4 w-4" />
              Re-Scrape SOUs
            </Button>
          </div>

          {status && (
            <div className="space-y-3">
              <Progress value={progress} className="h-2" />
              <div className="grid grid-cols-4 gap-2 text-center text-sm">
                <div className="bg-muted p-2 rounded">
                  <div className="font-bold">{status.processed}/{status.total}</div>
                  <div className="text-xs text-muted-foreground">Processed</div>
                </div>
                <div className="bg-green-500/10 p-2 rounded">
                  <div className="font-bold text-green-600">{status.success}</div>
                  <div className="text-xs text-muted-foreground">Success</div>
                </div>
                <div className="bg-red-500/10 p-2 rounded">
                  <div className="font-bold text-red-600">{status.errors}</div>
                  <div className="text-xs text-muted-foreground">Errors</div>
                </div>
                <div className="bg-primary/10 p-2 rounded">
                  <div className="font-bold text-primary">{status.total_links}</div>
                  <div className="text-xs text-muted-foreground">Links Found</div>
                </div>
              </div>

              {status.results.length > 0 && (
                <div className="max-h-48 overflow-y-auto border rounded text-sm">
                  <table className="w-full">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left p-2">Document</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Links</th>
                      </tr>
                    </thead>
                    <tbody>
                      {status.results.map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2 font-mono text-xs">{r.doc_number}</td>
                          <td className="p-2">
                            {r.status === 'success' ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                          </td>
                          <td className="p-2">
                            {r.status === 'success' ? (
                              <Badge variant="outline">{r.links_found}</Badge>
                            ) : (
                              <span className="text-xs text-red-500">{r.error}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
