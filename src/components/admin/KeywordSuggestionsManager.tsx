import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Scale,
  Minus,
  Plus,
  Code,
  Copy,
  ExternalLink,
  Clock,
  Filter
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface KeywordSuggestion {
  id: string;
  keyword: string;
  category: 'support' | 'oppose' | 'conditional' | 'no_opinion';
  source_response_id: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  // Joined data
  source_org?: string | null;
  source_file_url?: string | null;
}

interface SuggestionStats {
  pending: number;
  approved: number;
  rejected: number;
}

const CATEGORY_CONFIG = {
  support: { icon: ThumbsUp, color: 'text-primary', bgColor: 'bg-primary/10', label: 'Support' },
  oppose: { icon: ThumbsDown, color: 'text-destructive', bgColor: 'bg-destructive/10', label: 'Oppose' },
  conditional: { icon: Scale, color: 'text-accent-foreground', bgColor: 'bg-accent', label: 'Conditional' },
  no_opinion: { icon: Minus, color: 'text-muted-foreground', bgColor: 'bg-muted', label: 'No Opinion' },
};

export function KeywordSuggestionsManager() {
  const [suggestions, setSuggestions] = useState<KeywordSuggestion[]>([]);
  const [stats, setStats] = useState<SuggestionStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [filterCategory, setFilterCategory] = useState<'all' | 'support' | 'oppose' | 'conditional' | 'no_opinion'>('all');
  
  // Review dialog state
  const [reviewingItem, setReviewingItem] = useState<KeywordSuggestion | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Manual add dialog state
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [newCategory, setNewCategory] = useState<'support' | 'oppose' | 'conditional' | 'no_opinion'>('support');

  // Code generation state
  const [showCodeDialog, setShowCodeDialog] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');

  const loadStats = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('stance_keyword_suggestions')
        .select('status');

      if (error) throw error;

      const stats: SuggestionStats = { pending: 0, approved: 0, rejected: 0 };
      (data || []).forEach(row => {
        if (row.status in stats) {
          stats[row.status as keyof SuggestionStats]++;
        }
      });
      setStats(stats);
    } catch (err) {
      console.error('[KeywordManager] Error loading stats:', err);
    }
  }, []);

  const loadSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('stance_keyword_suggestions')
        .select(`
          id,
          keyword,
          category,
          source_response_id,
          status,
          reviewer_notes,
          created_at,
          reviewed_at
        `)
        .order('created_at', { ascending: false });

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }
      if (filterCategory !== 'all') {
        query = query.eq('category', filterCategory);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;

      // Fetch source response details for each suggestion
      const suggestionsWithSource: KeywordSuggestion[] = [];
      for (const row of data || []) {
        let sourceOrg: string | null = null;
        let sourceFileUrl: string | null = null;

        if (row.source_response_id) {
          const { data: responseData } = await supabase
            .from('remiss_responses')
            .select('responding_organization, file_url')
            .eq('id', row.source_response_id)
            .maybeSingle();

          if (responseData) {
            sourceOrg = responseData.responding_organization;
            sourceFileUrl = responseData.file_url;
          }
        }

        suggestionsWithSource.push({
          ...row,
          category: row.category as KeywordSuggestion['category'],
          status: row.status as KeywordSuggestion['status'],
          source_org: sourceOrg,
          source_file_url: sourceFileUrl,
        });
      }

      setSuggestions(suggestionsWithSource);
    } catch (err) {
      console.error('[KeywordManager] Error loading suggestions:', err);
      toast.error('Failed to load keyword suggestions');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterCategory]);

  useEffect(() => {
    loadStats();
    loadSuggestions();
  }, [loadStats, loadSuggestions]);

  const openReview = (item: KeywordSuggestion) => {
    setReviewingItem(item);
    setReviewNotes(item.reviewer_notes || '');
  };

  const closeReview = () => {
    setReviewingItem(null);
    setReviewNotes('');
  };

  const updateSuggestionStatus = async (id: string, status: 'approved' | 'rejected') => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('stance_keyword_suggestions')
        .update({
          status,
          reviewer_notes: reviewNotes || null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      toast.success(`Keyword ${status}`);
      closeReview();
      await loadStats();
      await loadSuggestions();
    } catch (err) {
      console.error('[KeywordManager] Error updating status:', err);
      toast.error('Failed to update suggestion');
    } finally {
      setSaving(false);
    }
  };

  const addManualKeyword = async () => {
    if (!newKeyword.trim()) {
      toast.error('Please enter a keyword');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('stance_keyword_suggestions')
        .insert({
          keyword: newKeyword.trim().toLowerCase(),
          category: newCategory,
          status: 'approved', // Manually added = pre-approved
          reviewer_notes: 'Manually added by admin',
          reviewed_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast.success('Keyword added');
      setShowAddDialog(false);
      setNewKeyword('');
      await loadStats();
      await loadSuggestions();
    } catch (err) {
      console.error('[KeywordManager] Error adding keyword:', err);
      toast.error('Failed to add keyword');
    } finally {
      setSaving(false);
    }
  };

  const generateCode = async () => {
    try {
      // Fetch all approved keywords
      const { data, error } = await supabase
        .from('stance_keyword_suggestions')
        .select('keyword, category')
        .eq('status', 'approved')
        .order('category')
        .order('keyword');

      if (error) throw error;

      if (!data || data.length === 0) {
        toast.info('No approved keywords to generate code for');
        return;
      }

      // Group by category
      const grouped: Record<string, string[]> = {
        support: [],
        oppose: [],
        conditional: [],
        no_opinion: [],
      };

      data.forEach(row => {
        if (row.category in grouped) {
          grouped[row.category].push(row.keyword);
        }
      });

      // Generate TypeScript code
      let code = `// ============================================
// APPROVED KEYWORD PATTERNS
// Generated from stance_keyword_suggestions table
// Add these to stance-analyzer.ts
// ============================================

`;

      for (const [category, keywords] of Object.entries(grouped)) {
        if (keywords.length === 0) continue;

        const categoryName = category.toUpperCase();
        code += `// ${categoryName} PATTERNS (${keywords.length} new)\n`;
        code += `// Add to ${categoryName}_PATTERNS array:\n`;
        
        keywords.forEach(kw => {
          // Escape regex special chars
          const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          code += `  { pattern: /\\b${escaped}\\b/gi, category: '${category}' },\n`;
        });
        
        code += '\n';
      }

      setGeneratedCode(code);
      setShowCodeDialog(true);
    } catch (err) {
      console.error('[KeywordManager] Error generating code:', err);
      toast.error('Failed to generate code');
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generatedCode);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('sv-SE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="h-5 w-5" />
          Keyword Suggestions Manager
        </CardTitle>
        <CardDescription>
          Review suggested keywords from manual reviews and generate code for stance-analyzer.ts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg border bg-accent text-center">
              <div className="text-2xl font-bold text-accent-foreground">{stats.pending}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
            <div className="p-3 rounded-lg border bg-primary/10 text-center">
              <div className="text-2xl font-bold text-primary">{stats.approved}</div>
              <div className="text-xs text-muted-foreground">Approved</div>
            </div>
            <div className="p-3 rounded-lg border bg-destructive/10 text-center">
              <div className="text-2xl font-bold text-destructive">{stats.rejected}</div>
              <div className="text-xs text-muted-foreground">Rejected</div>
            </div>
          </div>
        )}

        {/* Actions bar */}
        <div className="flex flex-wrap items-center gap-4 pt-2 border-t">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
              <SelectTrigger className="w-28 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-50 bg-background border shadow-lg">
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v as typeof filterCategory)}>
              <SelectTrigger className="w-32 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-50 bg-background border shadow-lg">
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="support">Support</SelectItem>
                <SelectItem value="oppose">Oppose</SelectItem>
                <SelectItem value="conditional">Conditional</SelectItem>
                <SelectItem value="no_opinion">No Opinion</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={() => { loadStats(); loadSuggestions(); }} variant="outline" size="sm" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>

          <div className="flex gap-2 ml-auto">
            <Button onClick={() => setShowAddDialog(true)} variant="outline" size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Keyword
            </Button>
            <Button onClick={generateCode} size="sm" disabled={!stats || stats.approved === 0}>
              <Code className="mr-2 h-4 w-4" />
              Generate Code
            </Button>
          </div>
        </div>

        {/* Suggestions list */}
        <div className="rounded-lg border overflow-hidden">
          <div className="max-h-[350px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left">Keyword</th>
                  <th className="p-3 text-left w-28">Category</th>
                  <th className="p-3 text-left w-24">Status</th>
                  <th className="p-3 text-left">Source</th>
                  <th className="p-3 text-left w-24">Date</th>
                  <th className="p-3 text-center w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {suggestions.map((item) => {
                  const catConfig = CATEGORY_CONFIG[item.category];
                  const CatIcon = catConfig.icon;
                  
                  return (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="p-3 font-mono text-sm">
                        {item.keyword}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className={catConfig.bgColor}>
                          <CatIcon className="h-3 w-3 mr-1" />
                          {catConfig.label}
                        </Badge>
                      </td>
                      <td className="p-3">
                        {item.status === 'pending' && (
                          <Badge variant="outline" className="bg-accent">
                            <Clock className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                        {item.status === 'approved' && (
                          <Badge variant="outline" className="bg-primary/10 text-primary">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Approved
                          </Badge>
                        )}
                        {item.status === 'rejected' && (
                          <Badge variant="outline" className="bg-destructive/10 text-destructive">
                            <XCircle className="h-3 w-3 mr-1" />
                            Rejected
                          </Badge>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {item.source_org ? (
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-[150px]">{item.source_org}</span>
                            {item.source_file_url && (
                              <a href={item.source_file_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="italic">Manual</span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {formatDate(item.created_at)}
                      </td>
                      <td className="p-3 text-center">
                        {item.status === 'pending' ? (
                          <Button size="sm" variant="outline" onClick={() => openReview(item)}>
                            Review
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {item.reviewed_at ? formatDate(item.reviewed_at) : '-'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {suggestions.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      {loading ? 'Loading...' : 'No suggestions found'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Review Dialog */}
        <Dialog open={!!reviewingItem} onOpenChange={(open) => !open && closeReview()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Review Keyword Suggestion</DialogTitle>
              <DialogDescription>
                Approve or reject this keyword for inclusion in stance-analyzer.ts
              </DialogDescription>
            </DialogHeader>
            
            {reviewingItem && (
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Keyword</Label>
                  <div className="p-3 rounded-lg border bg-muted font-mono text-lg">
                    {reviewingItem.keyword}
                  </div>
                </div>
                
                <div className="flex gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Category</Label>
                    <Badge variant="outline" className={CATEGORY_CONFIG[reviewingItem.category].bgColor}>
                      {CATEGORY_CONFIG[reviewingItem.category].label}
                    </Badge>
                  </div>
                  {reviewingItem.source_org && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Source</Label>
                      <div className="flex items-center gap-1 text-sm">
                        <span>{reviewingItem.source_org}</span>
                        {reviewingItem.source_file_url && (
                          <a href={reviewingItem.source_file_url} target="_blank" rel="noopener noreferrer" className="text-primary">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Notes (optional)</Label>
                  <Textarea
                    placeholder="Reason for approval/rejection..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={closeReview}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => reviewingItem && updateSuggestionStatus(reviewingItem.id, 'rejected')}
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                Reject
              </Button>
              <Button
                onClick={() => reviewingItem && updateSuggestionStatus(reviewingItem.id, 'approved')}
                disabled={saving}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Approve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Keyword Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Add Keyword Manually</DialogTitle>
              <DialogDescription>
                Add a new keyword pattern directly (will be pre-approved)
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Keyword Pattern</Label>
                <Input
                  placeholder="e.g., 'bifaller förslaget'"
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Enter the Swedish keyword or phrase (case-insensitive)
                </p>
              </div>
              
              <div className="space-y-2">
                <Label className="text-sm font-medium">Category</Label>
                <Select value={newCategory} onValueChange={(v) => setNewCategory(v as typeof newCategory)}>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="z-[100] bg-background border shadow-lg">
                    <SelectItem value="support">Support</SelectItem>
                    <SelectItem value="oppose">Oppose</SelectItem>
                    <SelectItem value="conditional">Conditional</SelectItem>
                    <SelectItem value="no_opinion">No Opinion</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button onClick={addManualKeyword} disabled={saving || !newKeyword.trim()}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Add Keyword
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Code Generation Dialog */}
        <Dialog open={showCodeDialog} onOpenChange={setShowCodeDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Code className="h-5 w-5" />
                Generated Code
              </DialogTitle>
              <DialogDescription>
                Copy this code and add the patterns to stance-analyzer.ts
              </DialogDescription>
            </DialogHeader>
            
            <ScrollArea className="h-[400px] rounded-lg border bg-muted/50 p-4">
              <pre className="text-xs font-mono whitespace-pre-wrap">
                {generatedCode}
              </pre>
            </ScrollArea>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setShowCodeDialog(false)}>
                Close
              </Button>
              <Button onClick={copyToClipboard}>
                <Copy className="mr-2 h-4 w-4" />
                Copy to Clipboard
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
