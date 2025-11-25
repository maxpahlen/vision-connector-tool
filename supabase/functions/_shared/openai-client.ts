// ============================================
// OpenAI Client - Shared wrapper for all agent LLM calls
// ============================================

import OpenAI from "https://esm.sh/openai@4.68.4";

// Default model - configurable via environment or this constant
export const DEFAULT_MODEL = 'gpt-4o-2024-08-06';

// Error type taxonomy for proper handling
export enum OpenAIErrorType {
  RATE_LIMIT = 'rate_limit',
  TIMEOUT = 'timeout',
  API_ERROR = 'api_error',
  VALIDATION_ERROR = 'validation_error',
  AUTHENTICATION_ERROR = 'authentication_error',
  UNKNOWN = 'unknown',
}

export interface OpenAIError {
  type: OpenAIErrorType;
  message: string;
  statusCode?: number;
  retryable: boolean;
}

/**
 * Get configured OpenAI client instance
 */
export function getOpenAIClient(): OpenAI {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is not set');
  }

  return new OpenAI({
    apiKey,
  });
}

/**
 * Classify OpenAI errors for proper handling and retries
 */
export function classifyError(error: unknown): OpenAIError {
  // Handle OpenAI SDK errors
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      return {
        type: OpenAIErrorType.RATE_LIMIT,
        message: error.message,
        statusCode: error.status,
        retryable: true,
      };
    }
    
    if (error.status === 401 || error.status === 403) {
      return {
        type: OpenAIErrorType.AUTHENTICATION_ERROR,
        message: error.message,
        statusCode: error.status,
        retryable: false,
      };
    }
    
    if (error.status === 400) {
      return {
        type: OpenAIErrorType.VALIDATION_ERROR,
        message: error.message,
        statusCode: error.status,
        retryable: false,
      };
    }
    
    if (error.status && error.status >= 500) {
      return {
        type: OpenAIErrorType.API_ERROR,
        message: error.message,
        statusCode: error.status,
        retryable: true,
      };
    }
  }

  // Handle timeout errors
  if (error instanceof Error && error.name === 'TimeoutError') {
    return {
      type: OpenAIErrorType.TIMEOUT,
      message: error.message,
      retryable: true,
    };
  }

  // Unknown error
  return {
    type: OpenAIErrorType.UNKNOWN,
    message: error instanceof Error ? error.message : String(error),
    retryable: false,
  };
}

/**
 * Retry a function with exponential backoff for transient failures
 * 
 * @param fn Function to retry
 * @param maxRetries Maximum number of retry attempts
 * @param initialDelayMs Initial delay in milliseconds
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelayMs = 1000
): Promise<T> {
  let lastError: OpenAIError | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = classifyError(error);
      
      // Don't retry non-retryable errors
      if (!lastError.retryable) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Calculate exponential backoff delay
      const delayMs = initialDelayMs * Math.pow(2, attempt);
      
      console.log(
        `OpenAI call failed (${lastError.type}), retrying in ${delayMs}ms... (attempt ${attempt + 1}/${maxRetries})`
      );
      
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw new Error(lastError?.message || 'Unknown error after retries');
}

/**
 * Call OpenAI with automatic retry logic for transient failures
 * 
 * @param messages Chat messages
 * @param tools Optional tool definitions
 * @param options Additional options (model, temperature, etc.)
 */
export async function callOpenAI(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  tools?: OpenAI.Chat.ChatCompletionTool[],
  options: {
    model?: string;
    temperature?: number;
    toolChoice?: OpenAI.Chat.ChatCompletionToolChoiceOption;
    maxRetries?: number;
  } = {}
): Promise<OpenAI.Chat.ChatCompletion> {
  const client = getOpenAIClient();
  
  const {
    model = DEFAULT_MODEL,
    temperature = 0.2,
    toolChoice,
    maxRetries = 3,
  } = options;
  
  return retryWithBackoff(
    () => client.chat.completions.create({
      model,
      messages,
      tools,
      tool_choice: toolChoice,
      temperature,
    }),
    maxRetries
  );
}
