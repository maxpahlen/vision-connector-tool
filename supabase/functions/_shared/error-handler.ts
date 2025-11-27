// ============================================
// Error Handler - Centralized error management with circuit breaker
// ============================================

import { OpenAIErrorType, classifyError, type OpenAIError } from './openai-client.ts';

export interface ErrorContext {
  agent_name: string;
  operation: string;
  document_id?: string;
  process_id?: string;
  task_id?: string;
}

export interface StructuredError {
  type: string;
  message: string;
  context: ErrorContext;
  timestamp: string;
  retryable: boolean;
  statusCode?: number;
  stack?: string;
}

/**
 * Circuit breaker to prevent cascading failures
 */
export class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: number = 0;
  private readonly threshold: number;
  private readonly resetTimeout: number;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(threshold: number = 5, resetTimeout: number = 60000) {
    this.threshold = threshold;
    this.resetTimeout = resetTimeout;
  }

  /**
   * Check if circuit should allow request
   */
  canExecute(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure >= this.resetTimeout) {
        console.log('🔄 Circuit breaker moving to half-open state');
        this.state = 'half-open';
        return true;
      }
      return false;
    }

    // half-open state - allow one request to test
    return true;
  }

  /**
   * Record successful execution
   */
  recordSuccess(): void {
    if (this.state === 'half-open') {
      console.log('✅ Circuit breaker reset to closed state');
      this.state = 'closed';
      this.failures = 0;
    }
  }

  /**
   * Record failed execution
   */
  recordFailure(): void {
    this.failures += 1;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      console.log('❌ Circuit breaker moving back to open state');
      this.state = 'open';
      return;
    }

    if (this.failures >= this.threshold) {
      console.log(`⚠️  Circuit breaker opening after ${this.failures} failures`);
      this.state = 'open';
    }
  }

  /**
   * Get current circuit state
   */
  getState(): { state: string; failures: number } {
    return {
      state: this.state,
      failures: this.failures,
    };
  }
}

/**
 * Global circuit breaker for OpenAI calls
 */
const openAICircuitBreaker = new CircuitBreaker(5, 60000);

/**
 * Create structured error with context
 */
export function createStructuredError(
  error: unknown,
  context: ErrorContext
): StructuredError {
  const classified = classifyError(error);
  
  return {
    type: classified.type,
    message: classified.message,
    context,
    timestamp: new Date().toISOString(),
    retryable: classified.retryable,
    statusCode: classified.statusCode,
    stack: error instanceof Error ? error.stack : undefined,
  };
}

/**
 * Log error with full context
 */
export function logError(structuredError: StructuredError): void {
  console.error('❌ Error occurred', {
    type: structuredError.type,
    agent: structuredError.context.agent_name,
    operation: structuredError.context.operation,
    message: structuredError.message,
    retryable: structuredError.retryable,
    timestamp: structuredError.timestamp,
    document_id: structuredError.context.document_id,
    process_id: structuredError.context.process_id,
    task_id: structuredError.context.task_id,
  });
}

/**
 * Handle agent task failure with proper error recording
 */
export async function handleTaskFailure(
  supabase: any,
  task_id: string | undefined,
  error: unknown,
  context: ErrorContext
): Promise<void> {
  const structuredError = createStructuredError(error, context);
  logError(structuredError);

  if (task_id) {
    await supabase
      .from('agent_tasks')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: structuredError.message,
        output_data: {
          error: structuredError,
        },
      })
      .eq('id', task_id);
  }

  // Record failure in circuit breaker
  openAICircuitBreaker.recordFailure();
}

/**
 * Check if operation can proceed (circuit breaker check)
 */
export function canProceed(): boolean {
  if (!openAICircuitBreaker.canExecute()) {
    const state = openAICircuitBreaker.getState();
    console.error('🚫 Circuit breaker is OPEN, blocking request', state);
    throw new Error(
      `Service temporarily unavailable (circuit breaker: ${state.state}, failures: ${state.failures})`
    );
  }
  return true;
}

/**
 * Record successful operation (for circuit breaker)
 */
export function recordSuccess(): void {
  openAICircuitBreaker.recordSuccess();
}

/**
 * Get circuit breaker status
 */
export function getCircuitBreakerStatus(): { state: string; failures: number } {
  return openAICircuitBreaker.getState();
}
