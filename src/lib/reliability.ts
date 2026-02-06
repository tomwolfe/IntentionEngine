import { NextRequest, NextResponse } from 'next/server';
import { LRUCache } from 'lru-cache';

export const rateLimitCache = new LRUCache<string, number>({
  max: 1000,
  ttl: 60 * 1000, // 1 minute
});

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

export async function withReliability(
  req: NextRequest,
  handler: () => Promise<NextResponse>,
  options = { timeoutMs: 8000, rateLimit: 10 }
) {
  // Simple rate limiting based on IP or a generic user ID
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : 'anonymous';
  const currentRequests = rateLimitCache.get(ip) || 0;

  if (currentRequests >= options.rateLimit) {
    return NextResponse.json({ error: "Too many requests. Limit is 10 per minute." }, { status: 429 });
  }

  rateLimitCache.set(ip, currentRequests + 1);

  // Timeout handling
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs);

  try {
    const responsePromise = handler();
    const timeoutPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(new Error('Request Timeout')));
    });

    const response = await Promise.race([responsePromise, timeoutPromise]) as NextResponse;
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.message === 'Request Timeout') {
      return NextResponse.json({ error: `Request timed out after ${options.timeoutMs / 1000} seconds` }, { status: 504 });
    }
    throw error;
  }
}
