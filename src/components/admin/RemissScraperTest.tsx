import { useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileText, CheckCircle, XCircle, AlertCircle, SkipForward } from "lucide-react";

interface RemissResult {
  document_id: string;
  doc_number: string;
  status: 'success' | 'no_remiss' | 'error' | 'skipped';
  discovery_method?: 'references' | 'page_scrape' | 'not_found';
  remiss_url?: string;
  remissvar_count?: number;
  error?: string;
}

interface ScrapeResponse {
  success: boolean;
  summary?: {
    total_processed: number;
    success: number;
    no_remiss: number;
    errors: number;
    skipped: number;
    total_remissvar: number;
    by_discovery_method?: {
      references: number;
      page_scrape: number;
      not_found: number;
    };
  };
  results?: RemissResult[];
  message?: string;
}

export function RemissScraperTest() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [limit, setLimit] = useState(10);
  const [skipExisting, setSkipExisting] = useState(true);
  const [result, setResult] = useState<ScrapeResponse | null>(null);

  const runScraper = async () => {
    setIsLoading(true);
    setResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('scrape-sou-remiss', {
        body: { 
          limit,
          skip_existing: skipExisting,
        },
      });

      if (error) throw error;

      setResult(data);
      
      if (data.success) {
        toast({
          title: "Remiss Scraper Complete",
          description: `Processed ${data.summary.total_processed} SOUs. Found ${data.summary.success} with remiss links, ${data.summary.total_remissvar} remissvar documents.`,
        });
      }
    } catch (err) {
      console.error('Error running remiss scraper:', err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to run scraper",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'no_remiss':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'skipped':
        return <SkipForward className="h-4 w-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge variant="default" className="bg-green-500">Success</Badge>;
      case 'no_remiss':
        return <Badge variant="secondary">No Remiss</Badge>;
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'skipped':
        return <Badge variant="outline">Skipped</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Phase 5.3: Remiss Scraper Test
        </CardTitle>
        <CardDescription>
          Scan SOU documents for remiss links and extract remissvar documents
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-2">
            <Label htmlFor="limit">Limit (SOUs to process)</Label>
            <Input
              id="limit"
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(e) => setLimit(parseInt(e.target.value) || 10)}
              className="w-24"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="skip-existing"
              checked={skipExisting}
              onCheckedChange={(checked) => setSkipExisting(checked === true)}
            />
            <Label htmlFor="skip-existing">Skip already processed</Label>
          </div>

          <Button onClick={runScraper} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? 'Scanning...' : 'Run Remiss Scraper'}
          </Button>
        </div>

        {result && result.summary && result.results && (
          <div className="space-y-4 mt-4">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              <div className="bg-muted p-3 rounded-lg text-center">
                <div className="text-2xl font-bold">{result.summary.total_processed}</div>
                <div className="text-xs text-muted-foreground">Processed</div>
              </div>
              <div className="bg-green-500/10 p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-green-600">{result.summary.success}</div>
                <div className="text-xs text-muted-foreground">With Remiss</div>
              </div>
              <div className="bg-yellow-500/10 p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-yellow-600">{result.summary.no_remiss}</div>
                <div className="text-xs text-muted-foreground">No Remiss</div>
              </div>
              <div className="bg-red-500/10 p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-red-600">{result.summary.errors}</div>
                <div className="text-xs text-muted-foreground">Errors</div>
              </div>
              <div className="bg-muted p-3 rounded-lg text-center">
                <div className="text-2xl font-bold">{result.summary.skipped}</div>
                <div className="text-xs text-muted-foreground">Skipped</div>
              </div>
              <div className="bg-primary/10 p-3 rounded-lg text-center">
                <div className="text-2xl font-bold text-primary">{result.summary.total_remissvar}</div>
                <div className="text-xs text-muted-foreground">Remissvar</div>
              </div>
            </div>

            {/* Discovery Method Breakdown */}
            {result.summary.by_discovery_method && (
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>Discovery: </span>
                <span className="text-green-600">{result.summary.by_discovery_method.references} via references</span>
                <span className="text-blue-600">{result.summary.by_discovery_method.page_scrape} via page scrape</span>
                <span className="text-yellow-600">{result.summary.by_discovery_method.not_found} not found</span>
              </div>
            )}

            {/* Results Table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-2">SOU</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Method</th>
                    <th className="text-left p-2">Remissvar</th>
                    <th className="text-left p-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {result.results.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 font-mono text-xs">{r.doc_number}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(r.status)}
                          {getStatusBadge(r.status)}
                        </div>
                      </td>
                      <td className="p-2">
                        {r.discovery_method && (
                          <Badge variant="outline" className="text-xs">
                            {r.discovery_method === 'references' ? '📚 refs' : 
                             r.discovery_method === 'page_scrape' ? '🔍 scrape' : '—'}
                          </Badge>
                        )}
                      </td>
                      <td className="p-2">
                        {r.remissvar_count !== undefined && (
                          <Badge variant="outline">{r.remissvar_count} docs</Badge>
                        )}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground truncate max-w-xs">
                        {r.remiss_url && (
                          <a 
                            href={r.remiss_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            View Remiss Page
                          </a>
                        )}
                        {r.error && <span className="text-red-500">{r.error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
