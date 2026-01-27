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
  ExternalLink, 
  CheckCircle2, 
  XCircle, 
  ChevronLeft, 
  ChevronRight, 
  RefreshCw,
  Eye,
  ThumbsUp,
  ThumbsDown,
  HelpCircle,
  Scale,
  Minus,
  Plus,
  FileText,
  AlertTriangle,
  Save,
  SkipForward
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ReviewItem {
  id: string;
  responding_organization: string | null;
  stance_summary: string | null;
  stance_signals: {
    support_count?: number;
    oppose_count?: number;
    conditional_count?: number;
    no_opinion_count?: number;
    keywords_found?: string[];
    section_context?: string;
    word_count?: number;
  } | null;
  file_url: string;
  raw_content: string | null;
  extraction_status: string | null;
  analysis_status: string | null;
  remiss_id: string;
  metadata: {
    manual_review?: ReviewDecision;
    ai_review?: AIReview;
    [key: string]: unknown;
  } | null;
}

interface AIReview {
  stance: 'support' | 'oppose' | 'conditional' | 'neutral';
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  key_phrases: string[];
  model: string;
  classified_at: string;
  original_stance: string;
  auto_applied: boolean;
}

interface ReviewDecision {
  is_correct: boolean | null;
  corrected_stance: string | null;
  missed_keywords: string[];
  suggest_keyword_rule: boolean;
  notes: string;
}

interface ReviewStats {
  total_uncertain: number;
  reviewed: number;
  pending: number;
  ai_low_confidence: number;
  ai_medium_confidence: number;
}

const STANCE_CONFIG = {
  support: { icon: ThumbsUp, color: 'text-primary', bgColor: 'bg-primary/10', label: 'Support' },
  oppose: { icon: ThumbsDown, color: 'text-destructive', bgColor: 'bg-destructive/10', label: 'Oppose' },
  conditional: { icon: Scale, color: 'text-accent-foreground', bgColor: 'bg-accent', label: 'Conditional' },
  neutral: { icon: Minus, color: 'text-muted-foreground', bgColor: 'bg-muted', label: 'Neutral' },
  mixed: { icon: HelpCircle, color: 'text-secondary-foreground', bgColor: 'bg-secondary', label: 'Mixed' },
};

const PAGE_SIZE = 20;

const CONFIDENCE_BADGE_COLORS = {
  high: 'bg-green-100 text-green-800 border-green-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-red-100 text-red-800 border-red-200',
};

export function StanceManualReview() {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [stats, setStats] = useState<ReviewStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [filterStance, setFilterStance] = useState<'all' | 'ai_low_confidence' | 'ai_medium_confidence'>('all');
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
  const [decision, setDecision] = useState<ReviewDecision>({
    is_correct: null,
    corrected_stance: null,
    missed_keywords: [],
    suggest_keyword_rule: false,
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [missedKeywordInput, setMissedKeywordInput] = useState('');
  const [showTextPreview, setShowTextPreview] = useState(false);

  // Load stats - only count AI low/medium confidence items
  const loadStats = useCallback(async () => {
    try {
      // Count AI low confidence
      const { count: aiLowConfCount } = await supabase
        .from('remiss_responses')
        .select('*', { count: 'exact', head: true })
        .eq('analysis_status', 'ai_low_confidence');

      // Count AI medium confidence (stored in metadata)
      // We need to query for medium confidence that wasn't auto-applied
      const PAGE_SIZE = 1000;
      let page = 0;
      let hasMore = true;
      let aiMediumCount = 0;

      while (hasMore) {
        const { data, error } = await supabase
          .from('remiss_responses')
          .select('metadata')
          .eq('analysis_status', 'ai_low_confidence')
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error) throw error;

        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          for (const row of data) {
            const metadata = row.metadata as { ai_review?: { confidence?: string } } | null;
            if (metadata?.ai_review?.confidence === 'medium') {
              aiMediumCount++;
            }
          }
          hasMore = data.length === PAGE_SIZE;
          page++;
        }
      }

      // Count reviewed (those with manual_review metadata)
      const { count: reviewedCount } = await supabase
        .from('remiss_responses')
        .select('*', { count: 'exact', head: true })
        .eq('analysis_status', 'ai_low_confidence')
        .not('metadata->manual_review', 'is', null);

      const total = aiLowConfCount || 0;
      
      setStats({
        total_uncertain: total,
        reviewed: reviewedCount || 0,
        pending: total - (reviewedCount || 0),
        ai_low_confidence: (aiLowConfCount || 0) - aiMediumCount,
        ai_medium_confidence: aiMediumCount,
      });
    } catch (err) {
      console.error('[StanceReview] Error loading stats:', err);
    }
  }, []);

  // Load items for review - ONLY AI low/medium confidence items
  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('remiss_responses')
        .select('id, responding_organization, stance_summary, stance_signals, file_url, raw_content, extraction_status, analysis_status, remiss_id, metadata', { count: 'exact' })
        .eq('analysis_status', 'ai_low_confidence');  // Only AI low confidence items

      // Prioritize unreviewed items first
      query = query
        .order('responding_organization', { ascending: true })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      // Filter by confidence level if needed
      let filteredData = (data || []) as unknown as ReviewItem[];
      
      if (filterStance === 'ai_low_confidence') {
        filteredData = filteredData.filter(item => {
          const confidence = item.metadata?.ai_review?.confidence;
          return confidence === 'low';
        });
      } else if (filterStance === 'ai_medium_confidence') {
        filteredData = filteredData.filter(item => {
          const confidence = item.metadata?.ai_review?.confidence;
          return confidence === 'medium';
        });
      }

      setItems(filteredData);
      setTotalCount(filterStance === 'all' ? (count || 0) : filteredData.length);
    } catch (err) {
      console.error('[StanceReview] Error loading items:', err);
      toast.error('Failed to load review items');
    } finally {
      setLoading(false);
    }
  }, [filterStance, page]);

  useEffect(() => {
    loadStats();
    loadItems();
  }, [loadStats, loadItems]);

  const openReview = (item: ReviewItem) => {
    setSelectedItem(item);
    // Pre-populate if already reviewed
    const existingReview = item.metadata?.manual_review;
    if (existingReview) {
      setDecision({
        is_correct: existingReview.is_correct ?? null,
        corrected_stance: existingReview.corrected_stance ?? null,
        missed_keywords: existingReview.missed_keywords ?? [],
        suggest_keyword_rule: existingReview.suggest_keyword_rule ?? false,
        notes: existingReview.notes ?? '',
      });
    } else {
      // If AI classified with low confidence, pre-populate with AI's suggestion
      const aiReview = item.metadata?.ai_review;
      setDecision({
        is_correct: null,
        corrected_stance: aiReview ? aiReview.stance : null,
        missed_keywords: [],
        suggest_keyword_rule: false,
        notes: '',
      });
    }
    setMissedKeywordInput('');
    setShowTextPreview(false);
  };

  const closeReview = () => {
    setSelectedItem(null);
  };

  const addMissedKeyword = () => {
    const kw = missedKeywordInput.trim().toLowerCase();
    if (kw && !decision.missed_keywords.includes(kw)) {
      setDecision(prev => ({
        ...prev,
        missed_keywords: [...prev.missed_keywords, kw],
      }));
      setMissedKeywordInput('');
    }
  };

  const removeMissedKeyword = (kw: string) => {
    setDecision(prev => ({
      ...prev,
      missed_keywords: prev.missed_keywords.filter(k => k !== kw),
    }));
  };

  const saveReview = async (skipToNext = false) => {
    if (!selectedItem) return;
    
    setSaving(true);
    try {
      const reviewData = {
        ...decision,
        reviewed_at: new Date().toISOString(),
      };

      // Update metadata with review decision
      const newMetadata = {
        ...(selectedItem.metadata || {}),
        manual_review: reviewData,
      };

      // If corrected stance provided, update stance_summary
      const updates: Record<string, unknown> = {
        metadata: newMetadata,
      };
      
      if (decision.is_correct === false && decision.corrected_stance) {
        updates.stance_summary = decision.corrected_stance;
        updates.analysis_status = 'manual_corrected';
      } else if (decision.is_correct === true) {
        updates.analysis_status = 'manual_confirmed';
      }

      const { error } = await supabase
        .from('remiss_responses')
        .update(updates)
        .eq('id', selectedItem.id);

      if (error) throw error;

      toast.success('Review saved');
      
      // If suggesting keyword rule, save keywords to database
      if (decision.suggest_keyword_rule && decision.missed_keywords.length > 0) {
        // Determine category based on corrected stance or original
        const targetStance = decision.corrected_stance || selectedItem.stance_summary;
        let category: 'support' | 'oppose' | 'conditional' | 'no_opinion' = 'support';
        
        if (targetStance === 'oppose') category = 'oppose';
        else if (targetStance === 'conditional') category = 'conditional';
        else if (targetStance === 'neutral') category = 'no_opinion';
        else if (targetStance === 'support') category = 'support';
        
        // Insert each keyword as a suggestion
        for (const keyword of decision.missed_keywords) {
          const { error: insertError } = await supabase
            .from('stance_keyword_suggestions')
            .insert({
              keyword: keyword.toLowerCase().trim(),
              category,
              source_response_id: selectedItem.id,
              status: 'pending',
            });
          
          if (insertError) {
            // Ignore duplicate constraint errors
            if (!insertError.message.includes('duplicate')) {
              console.error('[StanceReview] Error saving keyword:', insertError);
            }
          }
        }
        
        toast.info(
          `${decision.missed_keywords.length} keyword(s) submitted for review`,
          { duration: 3000 }
        );
      }

      await loadStats();
      await loadItems();

      if (skipToNext) {
        // Find next unreviewed item
        const currentIndex = items.findIndex(i => i.id === selectedItem.id);
        const nextItem = items.find((item, idx) => idx > currentIndex && !item.metadata?.manual_review);
        if (nextItem) {
          openReview(nextItem);
        } else {
          closeReview();
        }
      } else {
        closeReview();
      }
    } catch (err) {
      console.error('[StanceReview] Save error:', err);
      toast.error('Failed to save review');
    } finally {
      setSaving(false);
    }
  };

  const highlightKeywords = (text: string, keywords: string[]): JSX.Element => {
    if (!keywords.length || !text) return <>{text}</>;
    
    // Escape special regex chars and create pattern
    const pattern = keywords
      .map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('|');
    const regex = new RegExp(`(${pattern})`, 'gi');
    const parts = text.split(regex);
    
    return (
      <>
        {parts.map((part, i) => {
        const isKeyword = keywords.some(kw => part.toLowerCase() === kw.toLowerCase());
        return isKeyword ? (
          <mark key={i} className="bg-accent px-0.5 rounded">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
      </>
    );
  };

  const getTextSnippet = (text: string | null, maxLength = 500): string => {
    if (!text) return 'No text available';
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  };

  const isReviewed = (item: ReviewItem): boolean => {
    return Boolean(item.metadata?.manual_review);
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          Manual Stance Review
        </CardTitle>
        <CardDescription>
          Review AI classifications with low/medium confidence that need human verification
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats summary */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg border bg-muted/30 text-center">
              <div className="text-2xl font-bold">{stats.total_uncertain}</div>
              <div className="text-xs text-muted-foreground">Total Needs Review</div>
            </div>
            <div className="p-3 rounded-lg border bg-destructive/10 text-center">
              <div className="text-2xl font-bold text-destructive">{stats.ai_low_confidence}</div>
              <div className="text-xs text-muted-foreground">Low Confidence</div>
            </div>
            <div className="p-3 rounded-lg border bg-accent text-center">
              <div className="text-2xl font-bold text-accent-foreground">{stats.ai_medium_confidence}</div>
              <div className="text-xs text-muted-foreground">Medium Confidence</div>
            </div>
            <div className="p-3 rounded-lg border bg-primary/10 text-center">
              <div className="text-2xl font-bold text-primary">{stats.reviewed}</div>
              <div className="text-xs text-muted-foreground">Reviewed</div>
            </div>
          </div>
        )}

        {/* Filter and refresh */}
        <div className="flex items-center gap-4 pt-2 border-t">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Filter:</span>
            <Select value={filterStance} onValueChange={(v) => { setFilterStance(v as typeof filterStance); setPage(0); }}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All AI Uncertain</SelectItem>
                <SelectItem value="ai_low_confidence">Low Confidence</SelectItem>
                <SelectItem value="ai_medium_confidence">Medium Confidence</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => { loadStats(); loadItems(); }} variant="outline" size="sm" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <span className="text-sm text-muted-foreground ml-auto">
            {totalCount} items
          </span>
        </div>

        {/* Items list */}
        <div className="rounded-lg border overflow-hidden">
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0 z-10">
                <tr>
                  <th className="p-3 text-left w-8">Status</th>
                  <th className="p-3 text-left">Organization</th>
                  <th className="p-3 text-left w-24">Stance</th>
                  <th className="p-3 text-left w-20">Source</th>
                  <th className="p-3 text-left">Keywords / AI Reasoning</th>
                  <th className="p-3 text-center w-20">Words</th>
                  <th className="p-3 text-center w-32">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
              {items.map((item) => {
                  const signals = item.stance_signals || {};
                  const keywords = signals.keywords_found || [];
                  const stanceConfig = STANCE_CONFIG[item.stance_summary as keyof typeof STANCE_CONFIG];
                  const reviewed = isReviewed(item);
                  const aiReview = item.metadata?.ai_review;
                  const isAIClassified = item.analysis_status === 'ai_classified' || item.analysis_status === 'ai_low_confidence';
                  
                  return (
                    <tr key={item.id} className={`hover:bg-muted/30 ${reviewed ? 'opacity-60' : ''}`}>
                      <td className="p-3">
                        {reviewed ? (
                          <CheckCircle2 className="h-4 w-4 text-primary" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-accent-foreground" />
                        )}
                      </td>
                      <td className="p-3 font-medium">
                        {item.responding_organization || 'Unknown'}
                      </td>
                      <td className="p-3">
                        {stanceConfig && (
                          <Badge variant="outline" className={stanceConfig.bgColor}>
                            {stanceConfig.label}
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">
                        {isAIClassified ? (
                          <Badge variant="outline" className={CONFIDENCE_BADGE_COLORS[aiReview?.confidence || 'low']}>
                            AI {aiReview?.confidence || '?'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-muted">
                            Keyword
                          </Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {isAIClassified && aiReview ? (
                            <span className="text-xs text-muted-foreground italic truncate max-w-xs" title={aiReview.reasoning}>
                              {aiReview.reasoning.slice(0, 60)}{aiReview.reasoning.length > 60 ? '...' : ''}
                            </span>
                          ) : (
                            <>
                              {keywords.slice(0, 3).map((kw, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">
                                  {kw}
                                </Badge>
                              ))}
                              {keywords.length > 3 && (
                                <Badge variant="outline" className="text-xs">
                                  +{keywords.length - 3}
                                </Badge>
                              )}
                              {keywords.length === 0 && (
                                <span className="text-muted-foreground text-xs italic">No keywords</span>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="p-3 text-center text-muted-foreground">
                        {signals.word_count?.toLocaleString() || '-'}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openReview(item)}
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            Review
                          </Button>
                          <a
                            href={item.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      {loading ? 'Loading...' : 'No items to review'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm text-muted-foreground">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0 || loading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1 || loading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Review Dialog */}
        <Dialog open={!!selectedItem} onOpenChange={(open) => !open && closeReview()}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Review: {selectedItem?.responding_organization || 'Unknown Organization'}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2">
                Current stance: 
                {selectedItem && STANCE_CONFIG[selectedItem.stance_summary as keyof typeof STANCE_CONFIG] && (
                  <Badge variant="outline" className={STANCE_CONFIG[selectedItem.stance_summary as keyof typeof STANCE_CONFIG].bgColor}>
                    {STANCE_CONFIG[selectedItem.stance_summary as keyof typeof STANCE_CONFIG].label}
                  </Badge>
                )}
                <a
                  href={selectedItem?.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 ml-auto"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open PDF
                </a>
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-6 py-4">
                {/* AI Classification Info (if available) */}
                {selectedItem?.metadata?.ai_review && (
                  <div className="p-4 rounded-lg border-2 border-purple-200 bg-purple-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-purple-800">AI Classification</span>
                        <Badge variant="outline" className={STANCE_CONFIG[selectedItem.metadata.ai_review.stance]?.bgColor}>
                          {STANCE_CONFIG[selectedItem.metadata.ai_review.stance]?.label}
                        </Badge>
                        <Badge variant="outline" className={CONFIDENCE_BADGE_COLORS[selectedItem.metadata.ai_review.confidence]}>
                          {selectedItem.metadata.ai_review.confidence} confidence
                        </Badge>
                      </div>
                      {selectedItem.metadata.ai_review.auto_applied ? (
                        <Badge className="bg-green-100 text-green-800 border-green-200">Auto-applied</Badge>
                      ) : (
                        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Needs Review</Badge>
                      )}
                    </div>
                    <p className="text-sm text-purple-900 italic">"{selectedItem.metadata.ai_review.reasoning}"</p>
                    <div className="flex flex-wrap gap-1">
                      <span className="text-xs text-muted-foreground">Key phrases:</span>
                      {selectedItem.metadata.ai_review.key_phrases.map((phrase, i) => (
                        <Badge key={i} variant="secondary" className="text-xs bg-purple-100">
                          {phrase}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Original: {selectedItem.metadata.ai_review.original_stance} • Model: {selectedItem.metadata.ai_review.model}
                    </div>
                  </div>
                )}

                {/* Keywords found */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Keywords Detected</Label>
                  <div className="flex flex-wrap gap-1">
                    {(selectedItem?.stance_signals?.keywords_found || []).map((kw, i) => (
                      <Badge key={i} variant="secondary">{kw}</Badge>
                    ))}
                    {(selectedItem?.stance_signals?.keywords_found || []).length === 0 && (
                      <span className="text-muted-foreground text-sm italic">No stance keywords found</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Section: {selectedItem?.stance_signals?.section_context || 'unknown'} • 
                    Support: {selectedItem?.stance_signals?.support_count || 0} • 
                    Oppose: {selectedItem?.stance_signals?.oppose_count || 0} •
                    Conditional: {selectedItem?.stance_signals?.conditional_count || 0} •
                    No Opinion: {selectedItem?.stance_signals?.no_opinion_count || 0}
                  </div>
                </div>

                {/* Text preview */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Extracted Text</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowTextPreview(!showTextPreview)}
                    >
                      {showTextPreview ? 'Show Less' : 'Show Full Text'}
                    </Button>
                  </div>
                  <div className="p-3 rounded-lg border bg-muted/30 text-sm font-mono whitespace-pre-wrap max-h-48 overflow-auto">
                    {highlightKeywords(
                      showTextPreview 
                        ? selectedItem?.raw_content || 'No content'
                        : getTextSnippet(selectedItem?.raw_content, 800),
                      selectedItem?.stance_signals?.keywords_found || []
                    )}
                  </div>
                </div>

                {/* Review form */}
                <div className="space-y-4 border-t pt-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Is the detected stance correct?</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={decision.is_correct === true ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setDecision(prev => ({ ...prev, is_correct: true, corrected_stance: null }))}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Yes, Correct
                      </Button>
                      <Button
                        variant={decision.is_correct === false ? 'destructive' : 'outline'}
                        size="sm"
                        onClick={() => setDecision(prev => ({ ...prev, is_correct: false }))}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        No, Incorrect
                      </Button>
                    </div>
                  </div>

                  {/* Corrected stance selector */}
                  {decision.is_correct === false && (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">What is the actual stance?</Label>
                      <Select 
                        value={decision.corrected_stance || ''} 
                        onValueChange={(v) => setDecision(prev => ({ ...prev, corrected_stance: v }))}
                      >
                        <SelectTrigger className="w-48 bg-background">
                          <SelectValue placeholder="Select stance..." />
                        </SelectTrigger>
                        <SelectContent className="z-[100] bg-background border shadow-lg">
                          <SelectItem value="support">Support</SelectItem>
                          <SelectItem value="oppose">Oppose</SelectItem>
                          <SelectItem value="conditional">Conditional</SelectItem>
                          <SelectItem value="neutral">Neutral (confirmed)</SelectItem>
                          <SelectItem value="mixed">Mixed (confirmed)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Missed keywords */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Missed Keywords</Label>
                    <p className="text-xs text-muted-foreground">
                      Add any stance keywords that were missed by the analyzer
                    </p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="e.g., 'bifaller förslaget'"
                        value={missedKeywordInput}
                        onChange={(e) => setMissedKeywordInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addMissedKeyword())}
                        className="flex-1"
                      />
                      <Button variant="outline" size="icon" onClick={addMissedKeyword}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {decision.missed_keywords.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {decision.missed_keywords.map((kw, i) => (
                          <Badge 
                            key={i} 
                            variant="outline" 
                            className="cursor-pointer hover:bg-destructive/10"
                            onClick={() => removeMissedKeyword(kw)}
                          >
                            {kw}
                            <XCircle className="h-3 w-3 ml-1" />
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Suggest adding to keyword rules */}
                  {decision.missed_keywords.length > 0 && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="suggest-rule"
                        checked={decision.suggest_keyword_rule}
                        onChange={(e) => setDecision(prev => ({ ...prev, suggest_keyword_rule: e.target.checked }))}
                        className="rounded"
                      />
                      <Label htmlFor="suggest-rule" className="text-sm cursor-pointer">
                        Suggest adding these keywords to the stance analyzer rules
                      </Label>
                    </div>
                  )}

                  {/* Notes */}
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Notes (optional)</Label>
                    <Textarea
                      placeholder="Any observations or context..."
                      value={decision.notes}
                      onChange={(e) => setDecision(prev => ({ ...prev, notes: e.target.value }))}
                      rows={2}
                    />
                  </div>
                </div>
              </div>
            </ScrollArea>

            <DialogFooter className="gap-2 border-t pt-4">
              <Button variant="ghost" onClick={closeReview}>
                Cancel
              </Button>
              <Button
                variant="outline"
                onClick={() => saveReview(true)}
                disabled={saving || decision.is_correct === null}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SkipForward className="mr-2 h-4 w-4" />}
                Save & Next
              </Button>
              <Button
                onClick={() => saveReview(false)}
                disabled={saving || decision.is_correct === null}
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Review
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
