import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Download, Database } from "lucide-react";

interface ScraperResult {
  success: boolean;
  count: number;
  documents?: any[];
  error?: string;
}

const ScraperTest = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScraperResult | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const { toast } = useToast();

  const triggerScraper = async () => {
    setLoading(true);
    setResult(null);
    
    try {
      toast({
        title: "Starting scraper...",
        description: "Fetching SOU metadata from sou.gov.se",
      });

      const { data, error } = await supabase.functions.invoke('scrape-sou-metadata', {
        body: { limit: 10 }
      });

      if (error) throw error;

      setResult(data);
      
      if (data.success) {
        toast({
          title: "Success!",
          description: `Scraped ${data.count} SOU documents`,
        });
        
        // Refresh documents list
        await loadDocuments();
      } else {
        toast({
          title: "Scraper failed",
          description: data.error || "Unknown error",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error calling scraper:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to call scraper",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async () => {
    setLoadingDocs(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Error loading documents:', error);
      toast({
        title: "Error",
        description: "Failed to load documents from database",
        variant: "destructive",
      });
    } finally {
      setLoadingDocs(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            SOU Metadata Scraper
          </CardTitle>
          <CardDescription>
            Test the scraper by fetching SOU documents from sou.gov.se
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button 
              onClick={triggerScraper} 
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Run Scraper (Limit 10)
            </Button>
            
            <Button 
              variant="outline" 
              onClick={loadDocuments} 
              disabled={loadingDocs}
            >
              {loadingDocs && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Database className="mr-2 h-4 w-4" />
              Refresh Documents
            </Button>
          </div>

          {result && (
            <div className="rounded-lg border p-4 bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant={result.success ? "default" : "destructive"}>
                  {result.success ? "Success" : "Failed"}
                </Badge>
                {result.success && (
                  <span className="text-sm text-muted-foreground">
                    {result.count} documents processed
                  </span>
                )}
              </div>
              {result.error && (
                <p className="text-sm text-destructive">{result.error}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Documents Database
          </CardTitle>
          <CardDescription>
            Recently scraped SOU documents (last 20)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {documents.length === 0 && !loadingDocs ? (
            <div className="text-center py-8 text-muted-foreground">
              No documents found. Run the scraper to fetch data.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SOU Number</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Ministry</TableHead>
                    <TableHead>PDF</TableHead>
                    <TableHead>Processed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell className="font-mono text-sm">
                        {doc.doc_number}
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        {doc.title}
                      </TableCell>
                      <TableCell>
                        {doc.ministry || "-"}
                      </TableCell>
                      <TableCell>
                        {doc.pdf_url ? (
                          <Badge variant="outline">Available</Badge>
                        ) : (
                          <Badge variant="secondary">N/A</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {doc.processed_at ? (
                          <Badge>Processed</Badge>
                        ) : (
                          <Badge variant="secondary">Pending</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ScraperTest;
