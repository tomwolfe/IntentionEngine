/**
 * Error Recovery Module
 * 
 * Provides error categorization and user-friendly error messages
 * for improved UX and debugging.
 */

export type ErrorCategory = 
  | 'NETWORK_FAILURE'      // Fetch failed, connection issues
  | 'RATE_LIMIT'          // 429 from API
  | 'TOOL_UNAVAILABLE'    // Circuit breaker open
  | 'VALIDATION_ERROR'    // Bad input
  | 'OFFLINE'             // No network connection
  | 'TIMEOUT'             // Request timeout
  | 'UNKNOWN';            // Uncategorized

export interface CategorizedError {
  category: ErrorCategory;
  message: string;
  userMessage: string;
  retryable: boolean;
}

// User-friendly error messages
export const ERROR_MESSAGES: Record<ErrorCategory, string> = {
  NETWORK_FAILURE: "Connection lost. Please check your network and try again.",
  RATE_LIMIT: "Too many requests. Please wait a moment and try again.",
  TOOL_UNAVAILABLE: "This service is temporarily unavailable. Try a simpler query or try again later.",
  VALIDATION_ERROR: "There was an issue with your request. Please check your input and try again.",
  OFFLINE: "You're currently offline. Please check your connection and try again.",
  TIMEOUT: "The request took too long. Please try again.",
  UNKNOWN: "Something went wrong. Please try again.",
};

// Determine if an error category is retryable
export const RETRYABLE_ERRORS: ErrorCategory[] = [
  'NETWORK_FAILURE',
  'RATE_LIMIT',
  'TIMEOUT',
  'OFFLINE',
];

/**
 * Categorize an error based on its message and properties
 */
export function categorizeError(error: Error | string): CategorizedError {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorLower = errorMessage.toLowerCase();

  // Check for offline/network errors
  if (
    errorLower.includes('offline') ||
    errorLower.includes('network') ||
    errorLower.includes('fetch') ||
    errorLower.includes('connection')
  ) {
    return {
      category: 'OFFLINE',
      message: errorMessage,
      userMessage: ERROR_MESSAGES.OFFLINE,
      retryable: true,
    };
  }

  // Check for rate limiting
  if (
    errorLower.includes('429') ||
    errorLower.includes('rate limit') ||
    errorLower.includes('too many requests')
  ) {
    return {
      category: 'RATE_LIMIT',
      message: errorMessage,
      userMessage: ERROR_MESSAGES.RATE_LIMIT,
      retryable: true,
    };
  }

  // Check for circuit breaker / tool unavailable
  if (
    errorLower.includes('circuit breaker') ||
    errorLower.includes('tool unavailable') ||
    errorLower.includes('service unavailable') ||
    errorLower.includes('503')
  ) {
    return {
      category: 'TOOL_UNAVAILABLE',
      message: errorMessage,
      userMessage: ERROR_MESSAGES.TOOL_UNAVAILABLE,
      retryable: true,
    };
  }

  // Check for validation errors
  if (
    errorLower.includes('validation') ||
    errorLower.includes('invalid') ||
    errorLower.includes('bad request') ||
    errorLower.includes('400')
  ) {
    return {
      category: 'VALIDATION_ERROR',
      message: errorMessage,
      userMessage: ERROR_MESSAGES.VALIDATION_ERROR,
      retryable: false,
    };
  }

  // Check for timeout
  if (
    errorLower.includes('timeout') ||
    errorLower.includes('timed out') ||
    errorLower.includes('504')
  ) {
    return {
      category: 'TIMEOUT',
      message: errorMessage,
      userMessage: ERROR_MESSAGES.TIMEOUT,
      retryable: true,
    };
  }

  // Default to unknown
  return {
    category: 'UNKNOWN',
    message: errorMessage,
    userMessage: ERROR_MESSAGES.UNKNOWN,
    retryable: false,
  };
}

/**
 * Get a user-friendly message for an error
 */
export function getUserFriendlyMessage(error: Error | string): string {
  return categorizeError(error).userMessage;
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: Error | string): boolean {
  return categorizeError(error).retryable;
}

/**
 * Error boundary for handling offline state during execution
 */
export class NetworkError extends Error {
  constructor(message: string = 'Network connection unavailable') {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Check if the browser is currently online
 */
export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true; // Default to online in SSR
  return navigator.onLine;
}

/**
 * Assert that the browser is online, throwing NetworkError if not
 */
export function assertOnline(operation?: string): void {
  if (!isOnline()) {
    throw new NetworkError(
      operation 
        ? `Cannot ${operation} while offline`
        : 'Network connection unavailable'
    );
  }
}
