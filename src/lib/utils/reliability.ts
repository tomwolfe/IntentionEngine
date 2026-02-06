export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF-OPEN';

export class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: BreakerState = 'CLOSED';
  private threshold: number;
  private timeout: number;

  constructor(threshold = 3, timeout = 30000) {
    this.threshold = threshold;
    this.timeout = timeout;
  }

  check(): boolean {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailure > this.timeout) {
        this.state = 'HALF-OPEN';
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  recordFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }

  getState(): BreakerState {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }

  getLastFailure(): number {
    return this.lastFailure;
  }
}

export const toolBreakers: Record<string, CircuitBreaker> = {};

export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  fallback?: () => Promise<T>
): Promise<T> {
  let breaker = toolBreakers[name];
  if (!breaker) {
    breaker = new CircuitBreaker(3, 30000);
    toolBreakers[name] = breaker;
  }
  
  if (!breaker.check()) {
    if (fallback) return fallback();
    throw new Error(`Circuit breaker for ${name} is OPEN`);
  }

  try {
    const result = await fn();
    breaker.recordSuccess();
    return result;
  } catch (error) {
    breaker.recordFailure();
    throw error;
  }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  backoff = 1000,
  timeoutMs = 10000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    let timeoutId: any;
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error('Request Timeout'));
          }, timeoutMs);
        })
      ]);
      if (timeoutId) clearTimeout(timeoutId);
      return result as T;
    } catch (error: any) {
      if (timeoutId) clearTimeout(timeoutId);
      lastError = error;
      const isTimeout = error.message === 'Request Timeout';
      const isRetryable = isTimeout || (error.status >= 500) || (error.status === 429) || !error.status;
      
      if (!isRetryable || attempt === retries - 1) {
        throw error;
      }
      
      const delay = backoff * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}