import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Brain, CheckCircle2, XCircle, RefreshCw, Play, BarChart3, ThumbsUp, ThumbsDown, HelpCircle, Scale, Minus, Sparkles, ChevronDown, AlertTriangle, Eye } from 'lucide-react';
import { StanceManualReview } from './StanceManualReview';
import { KeywordSuggestionsManager } from './KeywordSuggestionsManager';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AnalysisStats {
  eligible: number;  // extraction_status = 'ok'
  not_started: number;
  ok: number;
  error: number;
  skipped: number;
}

interface StanceDistribution {
  support: number;
  oppose: number;
  conditional: number;
  neutral: number;
  mixed: number;
}

interface AnalysisDetail {
  response_id: string;
  responding_organization: string | null;
  stance_summary: string;
  keywords_found: string[];
  word_count: number;
  section_context: string;
}

interface BatchResult {
  processed: number;
  analyzed: number;
  skipped: number;
  errors: Array<{ response_id: string; error: string }>;
  summary: StanceDistribution;
  details: AnalysisDetail[];
  dry_run: boolean;
}

// AI Classification types
interface AIClassificationStats {
  neutral_no_keywords: number;
  mixed: number;
  ai_classified: number;
  ai_low_confidence: number;
  pending: number;
}

interface AIClassificationDetail {
  response_id: string;
  organization: string | null;
  original_stance: string;
  ai_stance: string;
  confidence: string;
  reasoning: string;
  auto_applied: boolean;
  input_text?: string;  // Text sent to AI for transparency
}

interface AIBatchResult {
  processed: number;
  classified: number;
  low_confidence: number;
  errors: Array<{ response_id: string; error: string }>;
  summary: { support: number; oppose: number; conditional: number; neutral: number };
  details: AIClassificationDetail[];
  dry_run: boolean;
}

const STANCE_CONFIG = {
  support: { icon: ThumbsUp, color: 'bg-green-500', label: 'Support', badgeClass: 'bg-green-100 text-green-800 border-green-200' },
  oppose: { icon: ThumbsDown, color: 'bg-red-500', label: 'Oppose', badgeClass: 'bg-red-100 text-red-800 border-red-200' },
  conditional: { icon: Scale, color: 'bg-yellow-500', label: 'Conditional', badgeClass: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  neutral: { icon: Minus, color: 'bg-gray-400', label: 'Neutral', badgeClass: 'bg-gray-100 text-gray-700 border-gray-200' },
  mixed: { icon: HelpCircle, color: 'bg-purple-500', label: 'Mixed', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200' },
};

const CONFIDENCE_COLORS = {
  high: 'bg-green-100 text-green-800 border-green-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-red-100 text-red-800 border-red-200',
};

export function RemissvarStanceAnalyzerTest() {
  const [stats, setStats] = useState<AnalysisStats | null>(null);
  const [stanceDistribution, setStanceDistribution] = useState<StanceDistribution | null>(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [batchSize, setBatchSize] = useState('25');
  const [batchCount, setBatchCount] = useState('1');
  const [currentBatch, setCurrentBatch] = useState(0);
  const [dryRun, setDryRun] = useState(false);
  const [lastResult, setLastResult] = useState<BatchResult | null>(null);
  const [totalProcessed, setTotalProcessed] = useState(0);
  const [shouldStop, setShouldStop] = useState(false);

  // AI Classification state
  const [aiStats, setAIStats] = useState<AIClassificationStats | null>(null);
  const [aiOpen, setAIOpen] = useState(false);
  const [aiAnalyzing, setAIAnalyzing] = useState(false);
  const [aiBatchSize, setAIBatchSize] = useState('10');
  const [aiBatchCount, setAIBatchCount] = useState('1');
  const [aiCurrentBatch, setAICurrentBatch] = useState(0);
  const [aiDryRun, setAIDryRun] = useState(true);
  const [aiThreshold, setAIThreshold] = useState<'high' | 'medium' | 'low'>('high');  // Default to high
  const [aiLastResult, setAILastResult] = useState<AIBatchResult | null>(null);
  const [aiTotalProcessed, setAITotalProcessed] = useState(0);
  const [aiShouldStop, setAIShouldStop] = useState(false);
  const [selectedAIDetail, setSelectedAIDetail] = useState<AIClassificationDetail | null>(null);

  // Load analysis stats with pagination
  const loadStats = async () => {
    setLoading(true);
    try {
      const counts: AnalysisStats = {
        eligible: 0,
        not_started: 0,
        ok: 0,
        error: 0,
        skipped: 0,
      };

      const distribution: StanceDistribution = {
        support: 0,
        oppose: 0,
        conditional: 0,
        neutral: 0,
        mixed: 0,
      };

      const PAGE_SIZE = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('remiss_responses')
          .select('extraction_status, analysis_status, stance_summary')
          .eq('extraction_status', 'ok')  // Only count eligible responses
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error) throw error;

        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          counts.eligible += data.length;
          
          data.forEach(row => {
            const analysisStatus = row.analysis_status || 'not_started';
            if (analysisStatus in counts) {
              counts[analysisStatus as keyof Omit<AnalysisStats, 'eligible'>]++;
            }
            
            // Count stance distribution for analyzed responses
            if (analysisStatus === 'ok' && row.stance_summary) {
              const stance = row.stance_summary as keyof StanceDistribution;
              if (stance in distribution) {
                distribution[stance]++;
              }
            }
          });
          
          hasMore = data.length === PAGE_SIZE;
          page++;
        }
      }

      setStats(counts);
      setStanceDistribution(distribution);
      console.log('[Stance Analyzer] Stats loaded:', counts, distribution);
    } catch (err) {
      console.error('[Stance Analyzer] Error loading stats:', err);
      toast.error('Failed to load analysis stats');
    } finally {
      setLoading(false);
    }
  };

  // Load AI classification stats
  const loadAIStats = async () => {
    try {
      const PAGE_SIZE = 1000;
      let page = 0;
      let hasMore = true;

      const counts: AIClassificationStats = {
        neutral_no_keywords: 0,
        mixed: 0,
        ai_classified: 0,
        ai_low_confidence: 0,
        pending: 0,
      };

      while (hasMore) {
        const { data, error } = await supabase
          .from('remiss_responses')
          .select('stance_summary, stance_signals, analysis_status, metadata')
          .eq('extraction_status', 'ok')
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (error) throw error;

        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          for (const row of data) {
            const signals = row.stance_signals as { keywords_found?: string[] } | null;
            const keywordsFound = signals?.keywords_found || [];
            const metadata = row.metadata as { ai_review?: unknown } | null;

            // Count AI classification statuses
            if (row.analysis_status === 'ai_classified') {
              counts.ai_classified++;
            } else if (row.analysis_status === 'ai_low_confidence') {
              counts.ai_low_confidence++;
            }

            // Count eligible for AI (not yet processed)
            if (row.analysis_status === 'ok' && !metadata?.ai_review) {
              if (row.stance_summary === 'neutral' && keywordsFound.length === 0) {
                counts.neutral_no_keywords++;
              } else if (row.stance_summary === 'mixed') {
                counts.mixed++;
              }
            }
          }

          hasMore = data.length === PAGE_SIZE;
          page++;
        }
      }

      counts.pending = counts.neutral_no_keywords + counts.mixed;
      setAIStats(counts);
      console.log('[AI Classification] Stats loaded:', counts);
    } catch (err) {
      console.error('[AI Classification] Error loading stats:', err);
    }
  };

  // Run a single AI classification batch
  const runSingleAIBatch = async (): Promise<AIBatchResult | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('classify-stance-ai', {
        body: {
          limit: parseInt(aiBatchSize, 10),
          dry_run: aiDryRun,
          confidence_threshold: aiThreshold,
        }
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[AI Classification] Error:', err);
      throw err;
    }
  };

  // Run multiple AI batches sequentially
  const runAIBatchAnalysis = async () => {
    setAIAnalyzing(true);
    setAILastResult(null);
    setAIShouldStop(false);

    const totalBatches = parseInt(aiBatchCount, 10);
    let accumulatedResult: AIBatchResult = {
      processed: 0,
      classified: 0,
      low_confidence: 0,
      errors: [],
      summary: { support: 0, oppose: 0, conditional: 0, neutral: 0 },
      details: [],
      dry_run: aiDryRun,
    };

    for (let i = 0; i < totalBatches; i++) {
      if (aiShouldStop) {
        toast.info(`Stopped after ${i} batches`);
        break;
      }

      setAICurrentBatch(i + 1);

      try {
        const data = await runSingleAIBatch();

        if (data) {
          accumulatedResult.processed += data.processed || 0;
          accumulatedResult.classified += data.classified || 0;
          accumulatedResult.low_confidence += data.low_confidence || 0;
          accumulatedResult.errors = [...accumulatedResult.errors, ...(data.errors || [])];
          accumulatedResult.details = [...accumulatedResult.details, ...(data.details || [])];

          // Accumulate stance counts
          if (data.summary) {
            accumulatedResult.summary.support += data.summary.support || 0;
            accumulatedResult.summary.oppose += data.summary.oppose || 0;
            accumulatedResult.summary.conditional += data.summary.conditional || 0;
            accumulatedResult.summary.neutral += data.summary.neutral || 0;
          }

          setAILastResult({ ...accumulatedResult });
          setAITotalProcessed(prev => prev + (data.processed || 0));

          // If no more items to process, stop early
          if (data.processed === 0) {
            toast.info(`No more responses to classify after batch ${i + 1}`);
            break;
          }
        }

        // Wait 2 seconds between batches (rate limiting)
        if (i < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

      } catch {
        toast.error(`AI batch ${i + 1} failed`);
        break;
      }
    }

    if (accumulatedResult.processed > 0) {
      toast.success(`AI classified ${accumulatedResult.classified}/${accumulatedResult.processed} responses${aiDryRun ? ' (dry run)' : ''}`);
    } else {
      toast.info('No responses to classify');
    }

    // Refresh all stats after AI classification
    if (!aiDryRun) {
      await loadStats();
      await loadAIStats();
    }

    setAIAnalyzing(false);
    setAICurrentBatch(0);
  };

  const stopAIAnalysis = () => {
    setAIShouldStop(true);
  };

  // Run a single batch analysis
  const runSingleBatch = async (): Promise<BatchResult | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('analyze-remissvar-stance', {
        body: {
          limit: parseInt(batchSize, 10),
          dry_run: dryRun,
        }
      });

      if (error) throw error;
      return data;
    } catch (err) {
      console.error('[Stance Analyzer] Error:', err);
      throw err;
    }
  };

  // Run multiple batches sequentially
  const runBatchAnalysis = async () => {
    setAnalyzing(true);
    setLastResult(null);
    setShouldStop(false);
    
    const totalBatches = parseInt(batchCount, 10);
    let accumulatedResult: BatchResult = {
      processed: 0,
      analyzed: 0,
      skipped: 0,
      errors: [],
      summary: { support: 0, oppose: 0, conditional: 0, neutral: 0, mixed: 0 },
      details: [],
      dry_run: dryRun,
    };

    for (let i = 0; i < totalBatches; i++) {
      if (shouldStop) {
        toast.info(`Stopped after ${i} batches`);
        break;
      }

      setCurrentBatch(i + 1);
      
      try {
        const data = await runSingleBatch();
        
        if (data) {
          accumulatedResult.processed += data.processed || 0;
          accumulatedResult.analyzed += data.analyzed || 0;
          accumulatedResult.skipped += data.skipped || 0;
          accumulatedResult.errors = [...accumulatedResult.errors, ...(data.errors || [])];
          accumulatedResult.details = [...accumulatedResult.details, ...(data.details || [])];
          
          // Accumulate stance counts
          if (data.summary) {
            accumulatedResult.summary.support += data.summary.support || 0;
            accumulatedResult.summary.oppose += data.summary.oppose || 0;
            accumulatedResult.summary.conditional += data.summary.conditional || 0;
            accumulatedResult.summary.neutral += data.summary.neutral || 0;
            accumulatedResult.summary.mixed += data.summary.mixed || 0;
          }
          
          setLastResult({ ...accumulatedResult });
          setTotalProcessed(prev => prev + (data.processed || 0));
          
          // If no more items to process, stop early
          if (data.processed === 0) {
            toast.info(`No more responses to analyze after batch ${i + 1}`);
            break;
          }
        }

        // Wait 2 seconds between batches
        if (i < totalBatches - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
      } catch {
        toast.error(`Batch ${i + 1} failed`);
        break;
      }
    }

    if (accumulatedResult.processed > 0) {
      toast.success(`Analyzed ${accumulatedResult.analyzed}/${accumulatedResult.processed} responses${dryRun ? ' (dry run)' : ''}`);
    } else {
      toast.info('No responses to analyze');
    }

    // Refresh stats after analysis
    if (!dryRun) {
      await loadStats();
    }
    
    setAnalyzing(false);
    setCurrentBatch(0);
  };

  const stopAnalysis = () => {
    setShouldStop(true);
  };

  useEffect(() => {
    loadStats();
    loadAIStats();
  }, []);

  const progressPercentage = stats && stats.eligible > 0
    ? Math.round(((stats.ok + stats.error + stats.skipped) / stats.eligible) * 100)
    : 0;

  const aiProgressPercentage = aiStats && aiStats.pending + aiStats.ai_classified + aiStats.ai_low_confidence > 0
    ? Math.round(((aiStats.ai_classified + aiStats.ai_low_confidence) / (aiStats.pending + aiStats.ai_classified + aiStats.ai_low_confidence)) * 100)
    : 0;

  // Calculate bar widths for stance distribution
  const totalAnalyzed = stanceDistribution 
    ? Object.values(stanceDistribution).reduce((a, b) => a + b, 0)
    : 0;

  const getStancePercentage = (count: number) => 
    totalAnalyzed > 0 ? Math.round((count / totalAnalyzed) * 100) : 0;

  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5" />
          Remissvar Stance Detection
        </CardTitle>
        <CardDescription>
          Analyze extracted remissvar text for stance keywords (Swedish patterns from SB PM 2021:1)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats refresh */}
        <div className="flex items-center gap-4">
          <Button onClick={loadStats} disabled={loading} variant="outline" size="sm">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh Stats
          </Button>
        </div>

        {/* Analysis progress */}
        {stats && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Analysis Progress (of {stats.eligible.toLocaleString()} extracted)
              </span>
              <span className="text-muted-foreground">
                {progressPercentage}% complete
              </span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
            
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">
                Pending: {stats.not_started.toLocaleString()}
              </Badge>
              <Badge variant="default">
                Analyzed: {stats.ok.toLocaleString()}
              </Badge>
              {stats.error > 0 && (
                <Badge variant="destructive">
                  Errors: {stats.error.toLocaleString()}
                </Badge>
              )}
              {stats.skipped > 0 && (
                <Badge variant="outline">
                  Skipped: {stats.skipped.toLocaleString()}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Stance distribution visualization */}
        {stanceDistribution && totalAnalyzed > 0 && (
          <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
            <h4 className="font-medium text-sm flex items-center gap-2">
              Stance Distribution
              <span className="text-muted-foreground font-normal">({totalAnalyzed} analyzed)</span>
            </h4>
            
            {/* Stacked bar chart */}
            <div className="h-8 rounded-lg overflow-hidden flex">
              {Object.entries(STANCE_CONFIG).map(([key, config]) => {
                const count = stanceDistribution[key as keyof StanceDistribution];
                const pct = getStancePercentage(count);
                if (pct === 0) return null;
                return (
                  <div
                    key={key}
                    className={`${config.color} flex items-center justify-center text-white text-xs font-medium transition-all`}
                    style={{ width: `${pct}%` }}
                    title={`${config.label}: ${count} (${pct}%)`}
                  >
                    {pct >= 8 && `${pct}%`}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 text-sm">
              {Object.entries(STANCE_CONFIG).map(([key, config]) => {
                const count = stanceDistribution[key as keyof StanceDistribution];
                const Icon = config.icon;
                return (
                  <div key={key} className="flex items-center gap-1.5">
                    <Icon className="h-4 w-4" style={{ color: config.color.replace('bg-', '').includes('gray') ? '#9ca3af' : undefined }} />
                    <span className={`px-1.5 py-0.5 rounded text-xs border ${config.badgeClass}`}>
                      {config.label}: {count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Batch controls */}
        <div className="flex flex-wrap items-center gap-4 pt-2 border-t">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Batch size:</span>
            <Select value={batchSize} onValueChange={setBatchSize} disabled={analyzing}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Batches:</span>
            <Select value={batchCount} onValueChange={setBatchCount} disabled={analyzing}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1</SelectItem>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {analyzing ? (
            <Button onClick={stopAnalysis} variant="destructive" size="sm">
              <XCircle className="mr-2 h-4 w-4" />
              Stop (after batch {currentBatch})
            </Button>
          ) : (
            <Button
              onClick={runBatchAnalysis}
              disabled={stats?.not_started === 0}
              variant={dryRun ? 'outline' : 'default'}
            >
              <Play className="mr-2 h-4 w-4" />
              {dryRun ? 'Dry Run' : `Analyze ${batchCount} Batch${parseInt(batchCount) > 1 ? 'es' : ''}`}
            </Button>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="rounded"
              disabled={analyzing}
            />
            Dry run (no writes)
          </label>
        </div>

        {/* Progress indicator */}
        {analyzing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Running batch {currentBatch} of {batchCount}...
          </div>
        )}

        {totalProcessed > 0 && (
          <div className="text-sm text-muted-foreground">
            Session total: {totalProcessed} processed
          </div>
        )}

        {/* Last batch results */}
        {lastResult && (
          <div className="space-y-2 pt-2 border-t">
            <h4 className="font-medium text-sm flex items-center gap-2">
              Batch Results
              {lastResult.dry_run && <Badge variant="outline" className="text-xs">DRY RUN</Badge>}
            </h4>
            
            <div className="flex gap-4 text-sm">
              <span>Processed: {lastResult.processed}</span>
              <span className="text-primary">Analyzed: {lastResult.analyzed}</span>
              <span>Skipped: {lastResult.skipped}</span>
              {lastResult.errors.length > 0 && (
                <span className="text-destructive">Errors: {lastResult.errors.length}</span>
              )}
            </div>

            {/* Batch stance summary */}
            {lastResult.summary && (
              <div className="flex flex-wrap gap-2">
                {Object.entries(lastResult.summary).map(([stance, count]) => {
                  const config = STANCE_CONFIG[stance as keyof typeof STANCE_CONFIG];
                  if (!config || count === 0) return null;
                  return (
                    <Badge key={stance} variant="outline" className={config.badgeClass}>
                      {config.label}: {count}
                    </Badge>
                  );
                })}
              </div>
            )}

            {/* Detailed results table */}
            {lastResult.details.length > 0 && (
              <div className="rounded-lg border max-h-64 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="border-b bg-muted/50 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Stance</th>
                      <th className="p-2 text-left">Organization</th>
                      <th className="p-2 text-left">Keywords</th>
                      <th className="p-2 text-right">Words</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lastResult.details.map((detail) => {
                      const stance = detail.stance_summary as keyof typeof STANCE_CONFIG;
                      const config = STANCE_CONFIG[stance] || STANCE_CONFIG.neutral;
                      return (
                        <tr key={detail.response_id} className="border-b hover:bg-muted/30">
                          <td className="p-2">
                            <Badge variant="outline" className={config.badgeClass}>
                              {config.label}
                            </Badge>
                          </td>
                          <td className="p-2 truncate max-w-xs" title={detail.responding_organization || undefined}>
                            {detail.responding_organization?.replace(/\s*\(pdf.*\)$/i, '') || 'Unknown'}
                          </td>
                          <td className="p-2 max-w-xs">
                            {detail.keywords_found.length > 0 ? (
                              <span className="text-muted-foreground font-mono text-[10px]">
                                {detail.keywords_found.slice(0, 3).join(', ')}
                                {detail.keywords_found.length > 3 && ` +${detail.keywords_found.length - 3}`}
                              </span>
                            ) : (
                              <span className="text-muted-foreground/50">—</span>
                            )}
                          </td>
                          <td className="p-2 text-right text-muted-foreground">
                            {detail.word_count.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Errors */}
            {lastResult.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/50 p-3 space-y-1 max-h-32 overflow-auto">
                <h5 className="text-xs font-medium text-destructive">Errors</h5>
                {lastResult.errors.map((err, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <XCircle className="h-3 w-3 text-destructive flex-shrink-0" />
                    <span className="font-mono">{err.response_id.substring(0, 8)}...</span>
                    <span className="text-muted-foreground">{err.error}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* All done message */}
        {stats?.not_started === 0 && stats.eligible > 0 && (
          <div className="text-sm text-muted-foreground p-4 border rounded-lg bg-muted/50 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            All extracted remissvar have been analyzed!
          </div>
        )}
      </CardContent>
    </Card>

    {/* AI Classification Section */}
    <Card>
      <Collapsible open={aiOpen} onOpenChange={setAIOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI-Assisted Stance Classification (Phase 5.6.4)
              <ChevronDown className={`ml-auto h-4 w-4 transition-transform ${aiOpen ? 'rotate-180' : ''}`} />
            </CardTitle>
            <CardDescription>
              Use AI to classify uncertain stances (neutral with no keywords + mixed)
            </CardDescription>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {/* AI Stats */}
            <div className="flex items-center gap-4 mb-4">
              <Button onClick={() => { loadAIStats(); loadStats(); }} disabled={loading || aiAnalyzing} variant="outline" size="sm">
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh Stats
              </Button>
            </div>

            {aiStats && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="p-3 rounded-lg border bg-gray-50 text-center">
                    <div className="text-2xl font-bold text-gray-600">{aiStats.neutral_no_keywords}</div>
                    <div className="text-xs text-muted-foreground">Neutral (0 keywords)</div>
                  </div>
                  <div className="p-3 rounded-lg border bg-purple-50 text-center">
                    <div className="text-2xl font-bold text-purple-600">{aiStats.mixed}</div>
                    <div className="text-xs text-muted-foreground">Mixed</div>
                  </div>
                  <div className="p-3 rounded-lg border bg-blue-50 text-center">
                    <div className="text-2xl font-bold text-blue-600">{aiStats.ai_classified}</div>
                    <div className="text-xs text-muted-foreground">AI Classified</div>
                  </div>
                  <div className="p-3 rounded-lg border bg-yellow-50 text-center">
                    <div className="text-2xl font-bold text-yellow-600">{aiStats.ai_low_confidence}</div>
                    <div className="text-xs text-muted-foreground">Low Confidence</div>
                  </div>
                  <div className="p-3 rounded-lg border bg-accent text-center">
                    <div className="text-2xl font-bold text-accent-foreground">{aiStats.pending}</div>
                    <div className="text-xs text-muted-foreground">Pending AI</div>
                  </div>
                </div>

                {/* Progress bar */}
                {(aiStats.ai_classified + aiStats.ai_low_confidence + aiStats.pending) > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>AI Classification Progress</span>
                      <span>{aiProgressPercentage}%</span>
                    </div>
                    <Progress value={aiProgressPercentage} className="h-2" />
                  </div>
                )}
              </div>
            )}

            {/* AI Batch controls */}
            <div className="flex flex-wrap items-center gap-4 pt-2 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Batch:</span>
                <Select value={aiBatchSize} onValueChange={setAIBatchSize} disabled={aiAnalyzing}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="30">30</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">×</span>
                <Select value={aiBatchCount} onValueChange={setAIBatchCount} disabled={aiAnalyzing}>
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Threshold:</span>
                <Select value={aiThreshold} onValueChange={(v) => setAIThreshold(v as 'high' | 'medium' | 'low')} disabled={aiAnalyzing}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High only</SelectItem>
                    <SelectItem value="medium">Medium+</SelectItem>
                    <SelectItem value="low">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {aiAnalyzing ? (
                <Button onClick={stopAIAnalysis} variant="destructive" size="sm">
                  <XCircle className="mr-2 h-4 w-4" />
                  Stop
                </Button>
              ) : (
                <Button
                  onClick={runAIBatchAnalysis}
                  disabled={aiStats?.pending === 0}
                  variant={aiDryRun ? 'outline' : 'default'}
                  className={!aiDryRun ? 'bg-purple-600 hover:bg-purple-700' : ''}
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {aiDryRun ? 'Dry Run' : 'Run AI Classification'}
                </Button>
              )}

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={aiDryRun}
                  onChange={(e) => setAIDryRun(e.target.checked)}
                  className="rounded"
                  disabled={aiAnalyzing}
                />
                Dry run
              </label>
            </div>

            {/* AI Progress indicator */}
            {aiAnalyzing && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Running AI batch {aiCurrentBatch} of {aiBatchCount}...
              </div>
            )}

            {aiTotalProcessed > 0 && (
              <div className="text-sm text-muted-foreground">
                Session total: {aiTotalProcessed} processed
              </div>
            )}

            {/* AI Results */}
            {aiLastResult && (
              <div className="space-y-2 pt-2 border-t">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  AI Classification Results
                  {aiLastResult.dry_run && <Badge variant="outline" className="text-xs">DRY RUN</Badge>}
                </h4>

                <div className="flex gap-4 text-sm">
                  <span>Processed: {aiLastResult.processed}</span>
                  <span className="text-purple-600">Classified: {aiLastResult.classified}</span>
                  <span className="text-yellow-600">Low Confidence: {aiLastResult.low_confidence}</span>
                  {aiLastResult.errors.length > 0 && (
                    <span className="text-destructive">Errors: {aiLastResult.errors.length}</span>
                  )}
                </div>

                {/* AI stance summary */}
                {aiLastResult.summary && (
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(aiLastResult.summary).map(([stance, count]) => {
                      const config = STANCE_CONFIG[stance as keyof typeof STANCE_CONFIG];
                      if (!config || count === 0) return null;
                      return (
                        <Badge key={stance} variant="outline" className={config.badgeClass}>
                          {config.label}: {count}
                        </Badge>
                      );
                    })}
                  </div>
                )}

                {/* AI detailed results table */}
                {aiLastResult.details.length > 0 && (
                  <div className="rounded-lg border max-h-64 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className="border-b bg-muted/50 sticky top-0">
                        <tr>
                          <th className="p-2 text-left">Original</th>
                          <th className="p-2 text-left">AI Stance</th>
                          <th className="p-2 text-left">Confidence</th>
                          <th className="p-2 text-center">Auto</th>
                          <th className="p-2 text-left">Organization</th>
                          <th className="p-2 text-left">Reasoning</th>
                          <th className="p-2 text-center">Inspect</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiLastResult.details.map((detail) => {
                          const aiStanceConfig = STANCE_CONFIG[detail.ai_stance as keyof typeof STANCE_CONFIG];
                          const confColor = CONFIDENCE_COLORS[detail.confidence as keyof typeof CONFIDENCE_COLORS];
                          return (
                            <tr key={detail.response_id} className="border-b hover:bg-muted/30">
                              <td className="p-2">
                                <Badge variant="outline" className="text-xs">
                                  {detail.original_stance}
                                </Badge>
                              </td>
                              <td className="p-2">
                                {aiStanceConfig && (
                                  <Badge variant="outline" className={aiStanceConfig.badgeClass}>
                                    {aiStanceConfig.label}
                                  </Badge>
                                )}
                              </td>
                              <td className="p-2">
                                <Badge variant="outline" className={confColor}>
                                  {detail.confidence}
                                </Badge>
                              </td>
                              <td className="p-2 text-center">
                                {detail.auto_applied ? (
                                  <CheckCircle2 className="h-4 w-4 text-primary inline" />
                                ) : (
                                  <AlertTriangle className="h-4 w-4 text-accent-foreground inline" />
                                )}
                              </td>
                              <td className="p-2 truncate max-w-xs" title={detail.organization || undefined}>
                                {detail.organization?.replace(/\s*\(pdf.*\)$/i, '') || 'Unknown'}
                              </td>
                              <td className="p-2 text-muted-foreground truncate max-w-xs" title={detail.reasoning}>
                                {detail.reasoning}
                              </td>
                              <td className="p-2 text-center">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedAIDetail(detail)}
                                  className="h-6 w-6 p-0"
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* AI Errors */}
                {aiLastResult.errors.length > 0 && (
                  <div className="rounded-lg border border-destructive/50 p-3 space-y-1 max-h-32 overflow-auto">
                    <h5 className="text-xs font-medium text-destructive">Errors</h5>
                    {aiLastResult.errors.map((err, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <XCircle className="h-3 w-3 text-destructive flex-shrink-0" />
                        <span className="font-mono">{err.response_id.substring(0, 8)}...</span>
                        <span className="text-muted-foreground">{err.error}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* All done message */}
            {aiStats?.pending === 0 && (aiStats.ai_classified + aiStats.ai_low_confidence) > 0 && (
              <div className="text-sm text-muted-foreground p-4 border rounded-lg bg-secondary flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-secondary-foreground" />
                All uncertain stances have been AI-classified!
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>

    {/* AI Detail Inspection Dialog */}
    <Dialog open={!!selectedAIDetail} onOpenChange={(open) => !open && setSelectedAIDetail(null)}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Classification Details: {selectedAIDetail?.organization?.replace(/\s*\(pdf.*\)$/i, '') || 'Unknown'}
          </DialogTitle>
          <DialogDescription>
            Full AI reasoning and input text for transparency and verification
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            {/* Classification Summary */}
            {selectedAIDetail && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="text-xs text-muted-foreground">Original Stance</div>
                  <Badge variant="outline" className="mt-1">{selectedAIDetail.original_stance}</Badge>
                </div>
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="text-xs text-muted-foreground">AI Classification</div>
                  {STANCE_CONFIG[selectedAIDetail.ai_stance as keyof typeof STANCE_CONFIG] && (
                    <Badge variant="outline" className={`mt-1 ${STANCE_CONFIG[selectedAIDetail.ai_stance as keyof typeof STANCE_CONFIG].badgeClass}`}>
                      {STANCE_CONFIG[selectedAIDetail.ai_stance as keyof typeof STANCE_CONFIG].label}
                    </Badge>
                  )}
                </div>
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="text-xs text-muted-foreground">Confidence</div>
                  <Badge variant="outline" className={`mt-1 ${CONFIDENCE_COLORS[selectedAIDetail.confidence as keyof typeof CONFIDENCE_COLORS]}`}>
                    {selectedAIDetail.confidence}
                  </Badge>
                </div>
                <div className="p-3 rounded-lg border bg-muted/30">
                  <div className="text-xs text-muted-foreground">Auto-Applied</div>
                  <div className="mt-1 flex items-center gap-1">
                    {selectedAIDetail.auto_applied ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <span className="text-sm">Yes</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="h-4 w-4 text-accent-foreground" />
                        <span className="text-sm">No (needs review)</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Full Reasoning */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">AI Reasoning</h4>
              <div className="p-4 rounded-lg border bg-secondary/50 text-sm">
                {selectedAIDetail?.reasoning || 'No reasoning provided'}
              </div>
            </div>

            {/* Input Text Sent to AI */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium flex items-center gap-2">
                Text Sent to AI
                <span className="text-xs text-muted-foreground font-normal">
                  ({selectedAIDetail?.input_text?.length?.toLocaleString() || 0} characters)
                </span>
              </h4>
              <div className="p-4 rounded-lg border bg-muted/30 text-sm font-mono whitespace-pre-wrap max-h-96 overflow-auto">
                {selectedAIDetail?.input_text || 'No input text available'}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>

    {/* Manual Review Section */}
    <StanceManualReview />

    {/* Keyword Suggestions Manager */}
    <KeywordSuggestionsManager />
    </>
  );
}
