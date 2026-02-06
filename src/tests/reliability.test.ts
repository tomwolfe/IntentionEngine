import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withReliability, toolBreakers, rateLimitCache } from '@/lib/reliability';
import { geocode_location } from '@/lib/tools';
import { NextRequest, NextResponse } from 'next/server';

describe('Reliability Logic', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Clear breakers
    for (const key in toolBreakers) {
      delete toolBreakers[key];
    }
    rateLimitCache.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return 504 when request times out', async () => {
    const req = new NextRequest('http://localhost/api/test');
    const handler = async () => {
      await new Promise(resolve => setTimeout(resolve, 20000));
      return NextResponse.json({ ok: true });
    };

    const promise = withReliability(req, handler, { timeoutMs: 15000, rateLimit: 10 });
    
    await vi.advanceTimersByTimeAsync(15001);
    
    const res = await promise;
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: 'Request timed out after 15 seconds' });
  });

  it('should retry when upstream returns 429', async () => {
    // We need to mock global fetch
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ lat: '40.7', lon: '-74' }]) });
    
    global.fetch = mockFetch;

    const promise = geocode_location({ location: 'New York' });
    
    // Fast-forward through retry delay
    await vi.advanceTimersByTimeAsync(1001);
    
    const result = await promise;
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should trip the circuit breaker after 3 failures', async () => {
    const req = new NextRequest('http://localhost/api/test');
    let callCount = 0;
    const handler = async () => {
      callCount++;
      return NextResponse.json({ error: 'Failure' }, { status: 500 });
    };

    // First failure
    let res = await withReliability(req, handler);
    expect(res.status).toBe(500);
    
    // Second failure
    res = await withReliability(req, handler);
    expect(res.status).toBe(500);

    // Third failure
    res = await withReliability(req, handler);
    expect(res.status).toBe(500);

    // Fourth call should be blocked by circuit breaker
    res = await withReliability(req, handler);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'Circuit breaker for route:/api/test is OPEN' });
    
    // Handler should only have been called 3 times
    expect(callCount).toBe(3);
  });

  it('should return 429 when rate limit is exceeded', async () => {
    const req = new NextRequest('http://localhost/api/test', {
      headers: { 'x-forwarded-for': '1.2.3.4' }
    });
    const handler = async () => NextResponse.json({ ok: true });

    // Call 10 times (limit is 10)
    for (let i = 0; i < 10; i++) {
      const res = await withReliability(req, handler, { timeoutMs: 8000, rateLimit: 10 });
      expect(res.status).toBe(200);
    }

    // 11th call should return 429
    const res = await withReliability(req, handler, { timeoutMs: 8000, rateLimit: 10 });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Too many requests. Limit is 10 per minute.' });
  });

  it('should reset circuit breaker after timeout', async () => {
    const req = new NextRequest('http://localhost/api/test');
    const handler = async () => NextResponse.json({ error: 'Failure' }, { status: 500 });

    // Trip the breaker
    await withReliability(req, handler);
    await withReliability(req, handler);
    await withReliability(req, handler);
    
    let res = await withReliability(req, handler);
    expect(res.status).toBe(503);

    // Advance time by 31 seconds
    await vi.advanceTimersByTimeAsync(31000);

    // Next call should be allowed (HALF-OPEN)
    const successHandler = async () => NextResponse.json({ ok: true });
    res = await withReliability(req, successHandler);
    expect(res.status).toBe(200);
  });
});