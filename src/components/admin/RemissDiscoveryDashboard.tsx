import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { RefreshCw, FileSearch, Link2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface RemissStats {
  totalSous: number;
  sousWithRemiss: number;
  totalRemisser: number;
  totalRemissvar: number;
  byDiscoveryMethod: Record<string, number>;
  recentRemisser: Array<{
    id: string;
    remiss_page_url: string;
    title: string | null;
    remissvar_count: number | null;
    status: string | null;
    parent_doc_number: string;
    discovery_method: string | null;
  }>;
  sousWithoutRemiss: Array<{
    id: string;
    doc_number: string;
    title: string;
  }>;
}

export function RemissDiscoveryDashboard() {
  const { data: stats, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['remiss-discovery-stats'],
    queryFn: async (): Promise<RemissStats> => {
      // Get total SOUs
      const { count: totalSous } = await supabase
        .from('documents')
        .select('*', { count: 'exact', head: true })
        .eq('doc_type', 'sou');

      // Get SOUs with remiss documents
      const { data: remissDocs } = await supabase
        .from('remiss_documents')
        .select(`
          id,
          remiss_page_url,
          title,
          remissvar_count,
          status,
          metadata,
          parent_document_id,
          documents!remiss_documents_parent_document_id_fkey (
            doc_number
          )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      // Get unique SOUs with remiss
      const sousWithRemissIds = new Set(remissDocs?.map(r => r.parent_document_id) || []);
      
      // Get total remissvar
      const { count: totalRemissvar } = await supabase
        .from('remiss_responses')
        .select('*', { count: 'exact', head: true });

      // Count by discovery method
      const byDiscoveryMethod: Record<string, number> = {};
      remissDocs?.forEach(r => {
        const method = (r.metadata as any)?.discovery_method || 'unknown';
        byDiscoveryMethod[method] = (byDiscoveryMethod[method] || 0) + 1;
      });

      // Get SOUs without remiss
      const { data: allSous } = await supabase
        .from('documents')
        .select('id, doc_number, title')
        .eq('doc_type', 'sou')
        .order('doc_number', { ascending: false })
        .limit(200);

      const sousWithoutRemiss = allSous?.filter(s => !sousWithRemissIds.has(s.id)).slice(0, 15) || [];

      // Format recent remisser
      const recentRemisser = remissDocs?.map(r => ({
        id: r.id,
        remiss_page_url: r.remiss_page_url,
        title: r.title,
        remissvar_count: r.remissvar_count,
        status: r.status,
        parent_doc_number: (r.documents as any)?.doc_number || 'Unknown',
        discovery_method: (r.metadata as any)?.discovery_method || 'unknown',
      })) || [];

      return {
        totalSous: totalSous || 0,
        sousWithRemiss: sousWithRemissIds.size,
        totalRemisser: remissDocs?.length || 0,
        totalRemissvar: totalRemissvar || 0,
        byDiscoveryMethod,
        recentRemisser,
        sousWithoutRemiss,
      };
    },
    staleTime: 30000,
  });

  const coveragePercent = stats ? Math.round((stats.sousWithRemiss / stats.totalSous) * 100) : 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileSearch className="h-5 w-5" />
              Remiss Discovery Dashboard
            </CardTitle>
            <CardDescription>
              Track SOU → Remiss linkage coverage by discovery method
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading stats...</div>
        ) : stats ? (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-muted rounded-lg p-4 text-center">
                <div className="text-3xl font-bold">{stats.totalSous}</div>
                <div className="text-sm text-muted-foreground">Total SOUs</div>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-green-600">{stats.sousWithRemiss}</div>
                <div className="text-sm text-muted-foreground">With Remiss</div>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-blue-600">{stats.totalRemisser}</div>
                <div className="text-sm text-muted-foreground">Remiss Docs</div>
              </div>
              <div className="bg-muted rounded-lg p-4 text-center">
                <div className="text-3xl font-bold text-purple-600">{stats.totalRemissvar}</div>
                <div className="text-sm text-muted-foreground">Remissvar</div>
              </div>
            </div>

            {/* Coverage Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium">SOU → Remiss Coverage</span>
                <span className="text-muted-foreground">{coveragePercent}%</span>
              </div>
              <Progress value={coveragePercent} className="h-3" />
              <div className="text-xs text-muted-foreground">
                {stats.sousWithRemiss} of {stats.totalSous} SOUs have linked remiss documents
              </div>
            </div>

            {/* Discovery Method Breakdown */}
            <div className="space-y-2">
              <div className="font-medium text-sm">Discovery Method Breakdown</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.byDiscoveryMethod).map(([method, count]) => (
                  <Badge key={method} variant="secondary" className="text-sm">
                    <Link2 className="h-3 w-3 mr-1" />
                    {method}: {count}
                  </Badge>
                ))}
                {Object.keys(stats.byDiscoveryMethod).length === 0 && (
                  <span className="text-muted-foreground text-sm">No remiss documents yet</span>
                )}
              </div>
            </div>

            {/* Recent Remisser */}
            {stats.recentRemisser.length > 0 && (
              <div className="space-y-2">
                <div className="font-medium text-sm">Recent Remiss Documents</div>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-2">Parent SOU</th>
                        <th className="text-left p-2">Title</th>
                        <th className="text-center p-2">Remissvar</th>
                        <th className="text-center p-2">Method</th>
                        <th className="text-center p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentRemisser.slice(0, 10).map((remiss) => (
                        <tr key={remiss.id} className="border-t">
                          <td className="p-2 font-medium">{remiss.parent_doc_number}</td>
                          <td className="p-2 max-w-xs truncate">
                            {remiss.title || <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="p-2 text-center">{remiss.remissvar_count || 0}</td>
                          <td className="p-2 text-center">
                            <Badge variant="outline" className="text-xs">
                              {remiss.discovery_method}
                            </Badge>
                          </td>
                          <td className="p-2 text-center">
                            {remiss.status === 'scraped' ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                            ) : (
                              <AlertCircle className="h-4 w-4 text-orange-500 mx-auto" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* SOUs Without Remiss */}
            {stats.sousWithoutRemiss.length > 0 && (
              <div className="space-y-2">
                <div className="font-medium text-sm">SOUs Without Remiss ({stats.totalSous - stats.sousWithRemiss})</div>
                <div className="flex flex-wrap gap-2">
                  {stats.sousWithoutRemiss.map((sou) => (
                    <Badge key={sou.id} variant="outline" className="text-xs">
                      {sou.doc_number}
                    </Badge>
                  ))}
                  {stats.sousWithoutRemiss.length < (stats.totalSous - stats.sousWithRemiss) && (
                    <Badge variant="secondary" className="text-xs">
                      +{stats.totalSous - stats.sousWithRemiss - stats.sousWithoutRemiss.length} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
