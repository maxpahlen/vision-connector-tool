import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, CheckCircle, XCircle, RefreshCw, Link2, AlertTriangle, ThumbsUp, ThumbsDown, PlusCircle, Play } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
// Backend-stored suggestion metadata (from link-remissvar-entities)
interface SuggestionMetadata {
  suggested_entity_id?: string;
  suggested_entity_name?: string;
  similarity_score?: number;
}

interface PendingMatch {
  id: string;
  responding_organization: string;
  normalized_org_name: string | null;
  file_url: string;
  remiss_id: string;
  // Computed/displayed values
  suggested_entity_id?: string;
  suggested_entity_name?: string;
  similarity_score?: number;
  confidence?: string;
}

interface Entity {
  id: string;
  name: string;
}

export function EntityMatchApprovalQueue() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [pendingMatches, setPendingMatches] = useState<PendingMatch[]>([]);
  const [entities, setEntities] = useState<Map<string, Entity>>(new Map());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState({ total: 0, medium: 0, low: 0, unmatched: 0, reviewed: 0, created: 0 });
  
  // Reprocess state
  const [reprocessing, setReprocessing] = useState<string | null>(null);
  
  // Create entity dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDialogMatch, setCreateDialogMatch] = useState<PendingMatch | null>(null);
  const [createEntityName, setCreateEntityName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchPendingMatches = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch responses that need review
      // IMPORTANT: PostgREST `not.in` does NOT include NULL values, so we must use an explicit OR.
      // We treat NULL match_confidence as "unprocessed/unmatched" and include it in the queue.
      const { data: responses, error } = await supabase
        .from('remiss_responses')
        .select('id, responding_organization, normalized_org_name, file_url, remiss_id, match_confidence, metadata')
        .is('entity_id', null)
        .not('normalized_org_name', 'is', null)
        .or('match_confidence.is.null,match_confidence.in.(low,medium)')
        .order('match_confidence', { ascending: true, nullsFirst: true })
        .limit(100);

      if (error) throw error;

      // Also get stats
      // NOTE: We keep this scoped to rows that have a normalized name so the queue + stats stay aligned.
      const { data: statsData } = await supabase
        .from('remiss_responses')
        .select('match_confidence')
        .is('entity_id', null)
        .not('normalized_org_name', 'is', null);

      if (statsData) {
        const medium = statsData.filter(r => r.match_confidence === 'medium').length;
        const low = statsData.filter(r => r.match_confidence === 'low').length;
        const unprocessed = statsData.filter(r => r.match_confidence === null).length;
        const unmatched = statsData.filter(r => r.match_confidence === 'unmatched').length;
        const reviewed = statsData.filter(r => r.match_confidence === 'rejected').length;
        setStats({ total: medium + low + unprocessed, medium, low, unmatched, reviewed, created: 0 });
      }

      // Fetch all organization entities for matching
      const { data: entityData } = await supabase
        .from('entities')
        .select('id, name')
        .eq('entity_type', 'organization');

      if (entityData) {
        const entityMap = new Map<string, Entity>();
        entityData.forEach(e => entityMap.set(e.id, e));
        setEntities(entityMap);

        // Use backend-computed suggestions from metadata when available
        // Fall back to local calculation for existing records without metadata
        const withMatches: PendingMatch[] = (responses || []).map(r => {
          const metadata = r.metadata as SuggestionMetadata | null;
          
          // Prefer backend suggestions (stored by link-remissvar-entities)
          if (metadata?.suggested_entity_id) {
            return {
              id: r.id,
              responding_organization: r.responding_organization || '',
              normalized_org_name: r.normalized_org_name,
              file_url: r.file_url,
              remiss_id: r.remiss_id,
              suggested_entity_id: metadata.suggested_entity_id,
              suggested_entity_name: metadata.suggested_entity_name,
              similarity_score: metadata.similarity_score,
              confidence: r.match_confidence || undefined
            };
          }
          
          // Fallback: compute locally for records without metadata
          const match = findBestMatch(r.normalized_org_name || '', entityData);
          return {
            id: r.id,
            responding_organization: r.responding_organization || '',
            normalized_org_name: r.normalized_org_name,
            file_url: r.file_url,
            remiss_id: r.remiss_id,
            suggested_entity_id: match?.id,
            suggested_entity_name: match?.name,
            similarity_score: match?.score,
            confidence: r.match_confidence || undefined
          };
        });
        setPendingMatches(withMatches);
      } else {
        // No entities to match against - just show responses without suggestions
        const noMatches: PendingMatch[] = (responses || []).map(r => ({
          id: r.id,
          responding_organization: r.responding_organization || '',
          normalized_org_name: r.normalized_org_name,
          file_url: r.file_url,
          remiss_id: r.remiss_id,
          confidence: r.match_confidence || undefined
        }));
        setPendingMatches(noMatches);
      }

      setSelectedIds(new Set());
    } catch (err) {
      console.error('Error fetching pending matches:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to fetch pending matches',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPendingMatches();
  }, [fetchPendingMatches]);

  const findBestMatch = (normalizedName: string, entityList: Entity[]): { id: string; name: string; score: number } | null => {
    if (!normalizedName) return null;
    
    const normalizedLower = normalizedName.toLowerCase();
    let bestMatch: { id: string; name: string; score: number } | null = null;

    for (const entity of entityList) {
      const entityLower = entity.name.toLowerCase();
      const score = calculateSimilarity(normalizedLower, entityLower);
      
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { id: entity.id, name: entity.name, score };
      }
    }

    return bestMatch && bestMatch.score >= 0.5 ? bestMatch : null;
  };

  const calculateSimilarity = (a: string, b: string): number => {
    if (a === b) return 1.0;
    if (!a || !b) return 0.0;

    if (a.includes(b) || b.includes(a)) {
      const longer = a.length > b.length ? a : b;
      const shorter = a.length > b.length ? b : a;
      return 0.8 + (0.2 * shorter.length / longer.length);
    }

    const bigramsA = getBigrams(a);
    const bigramsB = getBigrams(b);
    
    if (bigramsA.size === 0 || bigramsB.size === 0) return 0.0;

    let intersection = 0;
    for (const bigram of bigramsA) {
      if (bigramsB.has(bigram)) intersection++;
    }

    return (2 * intersection) / (bigramsA.size + bigramsB.size);
  };

  const getBigrams = (str: string): Set<string> => {
    const bigrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.substring(i, i + 2));
    }
    return bigrams;
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allWithMatches = pendingMatches
        .filter(m => m.suggested_entity_id)
        .map(m => m.id);
      setSelectedIds(new Set(allWithMatches));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSet = new Set(selectedIds);
    if (checked) {
      newSet.add(id);
    } else {
      newSet.delete(id);
    }
    setSelectedIds(newSet);
  };

  const handleApproveSelected = async () => {
    if (selectedIds.size === 0) return;
    
    setApproving(true);
    try {
      let successCount = 0;
      let errorCount = 0;

      for (const id of selectedIds) {
        const match = pendingMatches.find(m => m.id === id);
        if (!match?.suggested_entity_id) continue;

        const { error } = await supabase
          .from('remiss_responses')
          .update({
            entity_id: match.suggested_entity_id,
            match_confidence: 'approved'
          })
          .eq('id', id);

        if (error) {
          console.error(`Failed to approve ${id}:`, error);
          errorCount++;
        } else {
          successCount++;
        }
      }

      toast({
        title: 'Batch Approval Complete',
        description: `Approved ${successCount} matches${errorCount > 0 ? `, ${errorCount} failed` : ''}`,
        variant: errorCount > 0 ? 'destructive' : 'default'
      });

      // Refresh the list
      fetchPendingMatches();
    } catch (err) {
      console.error('Batch approval error:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Batch approval failed',
        variant: 'destructive'
      });
    } finally {
      setApproving(false);
    }
  };

  const handleRejectSelected = async () => {
    if (selectedIds.size === 0) return;
    
    setApproving(true);
    try {
      const { error } = await supabase
        .from('remiss_responses')
        .update({ match_confidence: 'rejected' })
        .in('id', [...selectedIds]);

      if (error) throw error;

      toast({
        title: 'Batch Rejection Complete',
        description: `Rejected ${selectedIds.size} matches`
      });

      fetchPendingMatches();
    } catch (err) {
      console.error('Batch rejection error:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Batch rejection failed',
        variant: 'destructive'
      });
    } finally {
      setApproving(false);
    }
  };

  const handleApproveOne = async (match: PendingMatch) => {
    if (!match.suggested_entity_id) return;

    try {
      const { error } = await supabase
        .from('remiss_responses')
        .update({
          entity_id: match.suggested_entity_id,
          match_confidence: 'approved'
        })
        .eq('id', match.id);

      if (error) throw error;

      toast({
        title: 'Approved',
        description: `Linked "${match.normalized_org_name}" to "${match.suggested_entity_name}"`
      });

      // Remove from list + update stats safely (supports NULL/unprocessed confidence)
      setPendingMatches(prev => prev.filter(m => m.id !== match.id));
      setStats(prev => {
        const next = { ...prev, total: Math.max(0, prev.total - 1) };
        if (match.confidence === 'medium') next.medium = Math.max(0, prev.medium - 1);
        if (match.confidence === 'low') next.low = Math.max(0, prev.low - 1);
        return next;
      });
    } catch (err) {
      console.error('Approval error:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Approval failed',
        variant: 'destructive'
      });
    }
  };

  const handleRejectOne = async (match: PendingMatch) => {
    try {
      const { error } = await supabase
        .from('remiss_responses')
        .update({ match_confidence: 'rejected' })
        .eq('id', match.id);

      if (error) throw error;

      toast({
        title: 'Rejected',
        description: `Marked "${match.normalized_org_name}" as rejected`
      });

      // Remove from list + update stats safely (supports NULL/unprocessed confidence)
      setPendingMatches(prev => prev.filter(m => m.id !== match.id));
      setStats(prev => {
        const next = {
          ...prev,
          total: Math.max(0, prev.total - 1),
          reviewed: prev.reviewed + 1,
        };
        if (match.confidence === 'medium') next.medium = Math.max(0, prev.medium - 1);
        if (match.confidence === 'low') next.low = Math.max(0, prev.low - 1);
        return next;
      });
    } catch (err) {
      console.error('Rejection error:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Rejection failed',
        variant: 'destructive'
      });
    }
  };

  // Open create entity dialog
  const openCreateDialog = (match: PendingMatch) => {
    setCreateDialogMatch(match);
    setCreateEntityName(match.normalized_org_name || match.responding_organization || '');
    setCreateDialogOpen(true);
  };

  // Handle entity creation
  const handleCreateEntity = async () => {
    if (!createDialogMatch || !createEntityName.trim()) return;
    
    setCreating(true);
    try {
      // 1. Insert new entity
      const { data: newEntity, error: insertError } = await supabase
        .from('entities')
        .insert({
          entity_type: 'organization',
          name: createEntityName.trim(),
          metadata: { 
            source: 'uninvited_respondent',
            created_from_response_id: createDialogMatch.id 
          }
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // 2. Update remiss_response with new entity_id
      const { error: updateError } = await supabase
        .from('remiss_responses')
        .update({
          entity_id: newEntity.id,
          match_confidence: 'created'
        })
        .eq('id', createDialogMatch.id);

      if (updateError) throw updateError;

      toast({
        title: 'Entity Created',
        description: `Created "${createEntityName}" and linked to response`
      });

      // Update local state
      setPendingMatches(prev => prev.filter(m => m.id !== createDialogMatch.id));
      setStats(prev => {
        const next = {
          ...prev,
          total: Math.max(0, prev.total - 1),
          created: prev.created + 1,
        };
        if (createDialogMatch.confidence === 'medium') next.medium = Math.max(0, prev.medium - 1);
        if (createDialogMatch.confidence === 'low') next.low = Math.max(0, prev.low - 1);
        return next;
      });

      // Close dialog
      setCreateDialogOpen(false);
      setCreateDialogMatch(null);
      setCreateEntityName('');
    } catch (err) {
      console.error('Create entity error:', err);
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create entity',
        variant: 'destructive'
      });
    } finally {
      setCreating(false);
    }
  };

  // Handle reprocessing with linker
  const handleReprocess = async (mode: 'unlinked' | 'unmatched_and_rejected') => {
    setReprocessing(mode);
    try {
      const { data, error } = await supabase.functions.invoke('link-remissvar-entities', {
        body: { 
          reprocess_mode: mode, 
          limit: 50
        }
      });
      
      if (error) throw error;
      
      toast({
        title: "Reprocessing complete",
        description: `Processed: ${data.processed}, Linked: ${data.linked?.total ?? 0}, Review: ${(data.not_linked?.medium ?? 0) + (data.not_linked?.low ?? 0)}`
      });
      
      // Refresh queue to show new matches
      fetchPendingMatches();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Reprocessing failed",
        description: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setReprocessing(null);
    }
  };

  const getConfidenceBadge = (confidence: string | undefined, score: number | undefined) => {
    if (confidence === 'medium') {
      return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400">Medium {score ? `(${(score * 100).toFixed(0)}%)` : ''}</Badge>;
    }
    if (confidence === 'low') {
      return <Badge variant="secondary" className="bg-orange-500/20 text-orange-400">Low {score ? `(${(score * 100).toFixed(0)}%)` : ''}</Badge>;
    }
    if (confidence === 'unmatched') {
      return <Badge variant="secondary" className="bg-muted text-muted-foreground">Unmatched</Badge>;
    }
    return <Badge variant="outline">{confidence ?? 'Unprocessed'}</Badge>;
  };

  const selectableCount = pendingMatches.filter(m => m.suggested_entity_id).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Entity Match Approval Queue
        </CardTitle>
        <CardDescription>
          Review and approve medium/low confidence matches between remissvar and entities
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-6">
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">Pending Review</div>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-2xl font-bold text-yellow-400">{stats.medium}</div>
            <div className="text-xs text-muted-foreground">Medium</div>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-2xl font-bold text-orange-400">{stats.low}</div>
            <div className="text-xs text-muted-foreground">Low</div>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-2xl font-bold text-muted-foreground">{stats.unmatched}</div>
            <div className="text-xs text-muted-foreground">Unmatched</div>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-2xl font-bold text-muted-foreground">{stats.reviewed}</div>
            <div className="text-xs text-muted-foreground">Rejected</div>
          </div>
          <div className="text-center p-3 bg-muted rounded-lg">
            <div className="text-2xl font-bold text-blue-400">{stats.created}</div>
            <div className="text-xs text-muted-foreground">Created</div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Button onClick={fetchPendingMatches} variant="outline" size="sm" disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <span className="text-sm text-muted-foreground">
                {selectedIds.size} of {selectableCount} selected
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                onClick={handleApproveSelected} 
                disabled={selectedIds.size === 0 || approving}
                size="sm"
                className="bg-green-600 hover:bg-green-700"
              >
                {approving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ThumbsUp className="h-4 w-4 mr-2" />}
                Approve Selected ({selectedIds.size})
              </Button>
              <Button 
                onClick={handleRejectSelected}
                disabled={selectedIds.size === 0 || approving}
                variant="destructive"
                size="sm"
              >
                <ThumbsDown className="h-4 w-4 mr-2" />
                Reject Selected
              </Button>
            </div>
          </div>
          
          {/* Reprocess Actions */}
          <div className="flex items-center gap-2 border-t pt-3">
            <span className="text-sm text-muted-foreground mr-2">Reprocess:</span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleReprocess('unlinked')}
              disabled={!!reprocessing}
            >
              {reprocessing === 'unlinked' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Run Matcher (Unprocessed)
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleReprocess('unmatched_and_rejected')}
              disabled={!!reprocessing}
            >
              {reprocessing === 'unmatched_and_rejected' ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Reprocess Rejected
            </Button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : pendingMatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <CheckCircle className="h-12 w-12 mb-2 text-green-400" />
            <p>No pending matches to review</p>
          </div>
        ) : (
          <ScrollArea className="h-[500px] border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox 
                      checked={selectedIds.size === selectableCount && selectableCount > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Source Name</TableHead>
                  <TableHead>Suggested Match</TableHead>
                  <TableHead className="w-32">Confidence</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingMatches.map((match) => (
                  <TableRow key={match.id} className={selectedIds.has(match.id) ? 'bg-muted/50' : ''}>
                    <TableCell>
                      {match.suggested_entity_id ? (
                        <Checkbox 
                          checked={selectedIds.has(match.id)}
                          onCheckedChange={(checked) => handleSelectOne(match.id, checked as boolean)}
                        />
                      ) : (
                        <span title="No match found">
                          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{match.normalized_org_name}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-xs">
                        {match.responding_organization}
                      </div>
                    </TableCell>
                    <TableCell>
                      {match.suggested_entity_name ? (
                        <div className="flex items-center gap-2">
                          <span>{match.suggested_entity_name}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">No match found</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {getConfidenceBadge(match.confidence, match.similarity_score)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {match.suggested_entity_id ? (
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 text-green-400 hover:text-green-300 hover:bg-green-400/10"
                            onClick={() => handleApproveOne(match)}
                            title="Approve suggested match"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            className="h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-400/10"
                            onClick={() => openCreateDialog(match)}
                            title="Create new entity"
                          >
                            <PlusCircle className="h-4 w-4" />
                          </Button>
                        )}
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                          onClick={() => handleRejectOne(match)}
                          title="Reject"
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </CardContent>

      {/* Create Entity Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PlusCircle className="h-5 w-5 text-blue-400" />
              Create New Entity
            </DialogTitle>
            <DialogDescription>
              Create a new organization entity for this uninvited respondent.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="entity-name">Organization Name</Label>
              <Input 
                id="entity-name"
                value={createEntityName}
                onChange={(e) => setCreateEntityName(e.target.value)}
                placeholder="Enter organization name"
              />
            </div>
            
            {createDialogMatch && (
              <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                <div><strong>Original:</strong> {createDialogMatch.responding_organization}</div>
                <div><strong>Normalized:</strong> {createDialogMatch.normalized_org_name}</div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateEntity} 
              disabled={!createEntityName.trim() || creating}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlusCircle className="h-4 w-4 mr-2" />}
              Create Entity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
