import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, ExternalLink, Search, Check, AlertTriangle, RefreshCw } from 'lucide-react';

interface AffectedSou {
  id: string;
  doc_number: string;
  title: string;
  url: string | null;
  pdf_url: string | null;
  raw_content: string | null;
  suggested_url?: string;
  status: 'needs_url' | 'pending_verification' | 'verified' | 'not_found';
}

export function SouUrlRepairTool() {
  const [affectedSous, setAffectedSous] = useState<AffectedSou[]>([]);
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [urlInputs, setUrlInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    loadAffectedSous();
  }, []);

  const loadAffectedSous = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('id, doc_number, title, url, pdf_url, raw_content')
        .eq('doc_type', 'sou')
        .is('url', null)
        .order('doc_number', { ascending: false });

      if (error) throw error;

      const sous: AffectedSou[] = (data || []).map(d => ({
        ...d,
        status: 'needs_url' as const,
      }));

      setAffectedSous(sous);
      
      // Initialize URL inputs
      const inputs: Record<string, string> = {};
      sous.forEach(s => {
        inputs[s.id] = '';
      });
      setUrlInputs(inputs);

    } catch (error) {
      console.error('Error loading affected SOUs:', error);
      toast.error('Failed to load affected SOUs');
    } finally {
      setLoading(false);
    }
  };

  const generateSearchUrl = (docNumber: string) => {
    const encoded = encodeURIComponent(`site:regeringen.se/rattsliga-dokument/statens-offentliga-utredningar "${docNumber}"`);
    return `https://www.google.com/search?q=${encoded}`;
  };

  const generateRegeringenSearchUrl = (docNumber: string) => {
    // Extract year and number for search
    const match = docNumber.match(/SOU (\d{4}):(\d+)/);
    if (match) {
      const [, year, num] = match;
      return `https://www.regeringen.se/sokresultat/?query=${year}%3A${num}&doktyp=sou`;
    }
    return `https://www.regeringen.se/sokresultat/?query=${encodeURIComponent(docNumber)}&doktyp=sou`;
  };

  const isValidSouUrl = (url: string): boolean => {
    return url.includes('/statens-offentliga-utredningar/') &&
           !url.includes('/kommittedirektiv/') &&
           !url.includes('/proposition/');
  };

  const updateUrl = async (souId: string, docNumber: string) => {
    const newUrl = urlInputs[souId]?.trim();
    
    if (!newUrl) {
      toast.error('Please enter a URL');
      return;
    }

    if (!isValidSouUrl(newUrl)) {
      toast.error('Invalid URL: Must contain /statens-offentliga-utredningar/ and not be a directive or proposition link');
      return;
    }

    setUpdating(souId);
    try {
      const { error } = await supabase
        .from('documents')
        .update({
          url: newUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', souId);

      if (error) throw error;

      toast.success(`Updated URL for ${docNumber}`);
      
      // Update local state
      setAffectedSous(prev => prev.map(s => 
        s.id === souId 
          ? { ...s, url: newUrl, status: 'verified' as const }
          : s
      ));

    } catch (error) {
      console.error('Error updating URL:', error);
      toast.error('Failed to update URL');
    } finally {
      setUpdating(null);
    }
  };

  const markAsNotFound = async (souId: string, docNumber: string) => {
    setUpdating(souId);
    try {
      // Update metadata to indicate SOU page not found
      const { data: doc } = await supabase
        .from('documents')
        .select('metadata')
        .eq('id', souId)
        .single();

      const metadata = (doc?.metadata || {}) as Record<string, unknown>;
      
      const { error } = await supabase
        .from('documents')
        .update({
          metadata: {
            ...metadata,
            sou_page_status: 'not_published',
            sou_page_checked_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', souId);

      if (error) throw error;

      toast.success(`Marked ${docNumber} as not yet published on regeringen.se`);
      
      setAffectedSous(prev => prev.map(s => 
        s.id === souId 
          ? { ...s, status: 'not_found' as const }
          : s
      ));

    } catch (error) {
      console.error('Error marking as not found:', error);
      toast.error('Failed to update status');
    } finally {
      setUpdating(null);
    }
  };

  const getStatusBadge = (status: AffectedSou['status']) => {
    switch (status) {
      case 'needs_url':
        return <Badge variant="destructive">Needs URL</Badge>;
      case 'pending_verification':
        return <Badge variant="outline">Pending</Badge>;
      case 'verified':
        return <Badge className="bg-green-500">Verified</Badge>;
      case 'not_found':
        return <Badge variant="secondary">Not Published</Badge>;
    }
  };

  const remainingCount = affectedSous.filter(s => s.status === 'needs_url').length;
  const verifiedCount = affectedSous.filter(s => s.status === 'verified').length;
  const notFoundCount = affectedSous.filter(s => s.status === 'not_found').length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          SOU URL Repair Tool
        </CardTitle>
        <CardDescription>
          Fix URLs for {affectedSous.length} SOUs that were incorrectly linked to directive pages.
          Find the correct SOU pages on regeringen.se and update them here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="flex gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Badge variant="destructive">{remainingCount}</Badge>
            <span>Needs URL</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-green-500">{verifiedCount}</Badge>
            <span>Verified</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{notFoundCount}</Badge>
            <span>Not Published</span>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadAffectedSous}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : affectedSous.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Check className="h-8 w-8 mx-auto mb-2 text-green-500" />
            All SOUs have valid URLs!
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Doc Number</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Search</TableHead>
                <TableHead className="w-[400px]">New URL</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {affectedSous.map((sou) => (
                <TableRow key={sou.id}>
                  <TableCell className="font-mono text-sm">
                    {sou.doc_number}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={sou.title}>
                    {sou.title}
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(sou.status)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <a
                          href={generateRegeringenSearchUrl(sou.doc_number)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Search on regeringen.se"
                        >
                          <Search className="h-3 w-3" />
                        </a>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <a
                          href={generateSearchUrl(sou.doc_number)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Google Search"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    {sou.status === 'needs_url' && (
                      <Input
                        placeholder="https://www.regeringen.se/rattsliga-dokument/statens-offentliga-utredningar/..."
                        value={urlInputs[sou.id] || ''}
                        onChange={(e) => setUrlInputs(prev => ({
                          ...prev,
                          [sou.id]: e.target.value
                        }))}
                        className="text-xs"
                      />
                    )}
                    {sou.status === 'verified' && (
                      <span className="text-xs text-green-600 truncate block max-w-[380px]" title={sou.url || ''}>
                        {sou.url}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {sou.status === 'needs_url' && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          onClick={() => updateUrl(sou.id, sou.doc_number)}
                          disabled={updating === sou.id || !urlInputs[sou.id]}
                        >
                          {updating === sou.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markAsNotFound(sou.id, sou.doc_number)}
                          disabled={updating === sou.id}
                          title="Mark as not yet published"
                        >
                          N/A
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Instructions */}
        <div className="mt-4 p-4 bg-muted rounded-lg text-sm space-y-2">
          <p className="font-medium">Instructions:</p>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
            <li>Click the search icons to find the correct SOU page on regeringen.se</li>
            <li>Copy the URL that contains <code className="bg-background px-1 rounded">/statens-offentliga-utredningar/</code></li>
            <li>Paste the URL and click the check button to save</li>
            <li>If the SOU is not yet published on regeringen.se, click "N/A"</li>
            <li>After updating URLs, re-run the Lagstiftningskedja scraper for these documents</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
