// ============================================
// Performance Tracker - Monitor agent execution metrics
// ============================================

export interface PerformanceMetrics {
  agent_name: string;
  operation: string;
  start_time: number;
  end_time?: number;
  duration_ms?: number;
  tokens_used?: number;
  api_calls: number;
  errors: number;
  retries: number;
  success: boolean;
}

export class PerformanceTracker {
  private metrics: PerformanceMetrics;

  constructor(agent_name: string, operation: string) {
    this.metrics = {
      agent_name,
      operation,
      start_time: Date.now(),
      api_calls: 0,
      errors: 0,
      retries: 0,
      success: false,
    };
  }

  /**
   * Record an API call with token usage
   */
  recordAPICall(tokens?: number): void {
    this.metrics.api_calls += 1;
    if (tokens) {
      this.metrics.tokens_used = (this.metrics.tokens_used || 0) + tokens;
    }
  }

  /**
   * Record an error
   */
  recordError(): void {
    this.metrics.errors += 1;
  }

  /**
   * Record a retry attempt
   */
  recordRetry(): void {
    this.metrics.retries += 1;
  }

  /**
   * Mark operation as successful and finalize metrics
   */
  complete(success: boolean = true): PerformanceMetrics {
    this.metrics.end_time = Date.now();
    this.metrics.duration_ms = this.metrics.end_time - this.metrics.start_time;
    this.metrics.success = success;
    return this.metrics;
  }

  /**
   * Get current metrics snapshot
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Log performance summary
   */
  logSummary(): void {
    const metrics = this.complete();
    console.log('📊 Performance Summary', {
      agent: metrics.agent_name,
      operation: metrics.operation,
      duration_ms: metrics.duration_ms,
      tokens_used: metrics.tokens_used || 0,
      api_calls: metrics.api_calls,
      errors: metrics.errors,
      retries: metrics.retries,
      success: metrics.success,
      efficiency: metrics.tokens_used 
        ? `${(metrics.duration_ms! / metrics.tokens_used).toFixed(2)}ms/token`
        : 'N/A',
    });
  }
}

/**
 * Cost estimation based on OpenAI pricing (as of 2024)
 * GPT-4o pricing: $2.50/1M input tokens, $10.00/1M output tokens
 */
export function estimateCost(inputTokens: number, outputTokens: number, model: string = 'gpt-4o'): number {
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
    'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.60 / 1_000_000 },
    'gpt-4.1': { input: 2.50 / 1_000_000, output: 10.00 / 1_000_000 },
  };

  const modelPricing = pricing[model] || pricing['gpt-4o'];
  return (inputTokens * modelPricing.input) + (outputTokens * modelPricing.output);
}
