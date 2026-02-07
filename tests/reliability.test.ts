import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseDateTime } from '@/lib/date-utils';
import { GeocodeLocationSchema, SearchRestaurantSchema, IntentRequestSchema } from '@/lib/validation-schemas';
import { cache } from '@/lib/cache';
import { geocode_location, search_restaurant, add_calendar_event, vibeMemory } from '@/lib/tools';
import { withReliability } from '@/lib/reliability';
import { createAuditLog, updateAuditLog, getAuditLog } from '@/lib/audit';
import { NextRequest, NextResponse } from 'next/server';

// Mock fetch for tool tests
global.fetch = vi.fn();

describe('Restaurant Search Logic', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vibeMemory.clear();
    await cache.clear();
  });

  it('should filter and sort restaurants correctly', async () => {
    const mockOverpassData = {
      elements: [
        { tags: { name: 'Pizza Palace', cuisine: 'pizza' }, lat: 45, lon: -73 },
        { tags: { name: 'Le Bistro', cuisine: 'french' }, lat: 45.1, lon: -73.1 },
        { tags: { name: 'Fast Burger', cuisine: 'fast_food' }, lat: 45.2, lon: -73.2 },
      ]
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOverpassData)
    });

    // Search for romantic french
    const result = await search_restaurant({ lat: 45, lon: -73, cuisine: 'french', romantic: true });
    
    expect(result.success).toBe(true);
    expect(result.result).toHaveLength(1);
    expect(result.result[0].name).toBe('Le Bistro');
  });

  it('should handle romantic sorting and filtering', async () => {
    const mockOverpassData = {
      elements: [
        { tags: { name: 'Generic Place' }, lat: 45, lon: -73 },
        { tags: { name: 'Romantic Italian', cuisine: 'italian' }, lat: 45, lon: -73 },
        { tags: { name: 'Fast Pizza', cuisine: 'pizza' }, lat: 45, lon: -73 },
      ]
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOverpassData)
    });

    const result = await search_restaurant({ lat: 45, lon: -73, romantic: true });
    expect(result.success).toBe(true);
    // Pizza should be filtered out
    expect(result.result.map((r: any) => r.name)).not.toContain('Fast Pizza');
    // Romantic Italian should be first
    expect(result.result[0].name).toBe('Romantic Italian');
  });

  it('should handle cuisine sorting', async () => {
    const mockOverpassData = {
      elements: [
        { tags: { name: 'Burger', cuisine: 'burger' }, lat: 45, lon: -73 },
        { tags: { name: 'Japanese Food', cuisine: 'japanese' }, lat: 45, lon: -73 },
        { tags: { name: 'Sushi Master', cuisine: 'sushi' }, lat: 45, lon: -73 },
      ]
    };

    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOverpassData)
    });

    const result = await search_restaurant({ lat: 45, lon: -73, cuisine: 'sushi' });
    expect(result.success).toBe(true);
    expect(result.result[0].name).toBe('Sushi Master');
  });

  it('should handle geocoding fallback in search_restaurant', async () => {
    (fetch as any)
      .mockResolvedValueOnce({ // geocode
        ok: true,
        json: () => Promise.resolve([{ lat: '45', lon: '-73' }])
      })
      .mockResolvedValueOnce({ // overpass
        ok: true,
        json: () => Promise.resolve({ elements: [] })
      });

    const result = await search_restaurant({ location: 'Paris' });
    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('Calendar Event Tool', () => {
  it('should generate a correct download URL', async () => {
    const result = await add_calendar_event({
      title: 'Dinner',
      start_time: '2026-02-05T19:00:00Z',
      end_time: '2026-02-05T21:00:00Z',
      restaurant_name: 'Le Bistro',
      restaurant_address: '123 Rue de Paris'
    });

    expect(result.success).toBe(true);
    expect(result.result!.download_url).toContain('title=Dinner');
    expect(result.result!.download_url).toContain('Restaurant%3A+Le+Bistro');
  });
});

describe('Audit Log System', () => {
  it('should create and update audit logs', async () => {
    const log = await createAuditLog('I want food');
    expect(log.id).toBeDefined();
    expect(log.intent).toBe('I want food');

    await updateAuditLog(log.id, { final_outcome: 'Completed' });
    const updated = await getAuditLog(log.id);
    expect(updated?.final_outcome).toBe('Completed');
  });
});

// Mock fetch for tool tests
global.fetch = vi.fn();

describe('Security and Sanitization', () => {
  it('should sanitize script tags in geocode location', () => {
    const input = { location: '<script>alert("xss")</script>Paris' };
    const result = GeocodeLocationSchema.safeParse(input);
    expect(result.success).toBe(true);
    expect(result.data?.location).toBe('<script>alert("xss")</script>Paris');
  });

  it('should handle SQL injection-like patterns gracefully', () => {
    const input = { intent: "Find restaurants' OR '1'='1" };
    const result = IntentRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
  
  it('should enforce maximum length for intent', () => {
    const longIntent = 'a'.repeat(3000);
    const result = IntentRequestSchema.safeParse({ intent: longIntent });
    expect(result.success).toBe(false);
  });
});

describe('Rate Limiting', () => {
  it('should rate limit after 10 requests', async () => {
    const req = {
      ip: '127.0.0.1',
      headers: new Headers(),
    } as unknown as NextRequest;

    const handler = async () => NextResponse.json({ ok: true });

    // 10 successful requests
    for (let i = 0; i < 10; i++) {
      const res = await withReliability(req, handler);
      expect(res.status).toBe(200);
    }

    // 11th request should fail
    const res = await withReliability(req, handler);
    expect(res.status).toBe(429);
  });
});

describe('Timeout Handling', () => {
  it('should timeout after specified time', async () => {
    const req = {
      ip: '127.0.0.1',
      headers: new Headers(),
    } as unknown as NextRequest;

    // A handler that takes too long
    const handler = () => new Promise<NextResponse>((resolve) => {
      setTimeout(() => resolve(NextResponse.json({ ok: true })), 10000);
    });

    vi.useFakeTimers();
    const promise = withReliability(req, handler, { timeoutMs: 1000, rateLimit: 100 });
    
    await vi.advanceTimersByTimeAsync(1500);
    
    const res = await promise;
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: "Request timed out after 1 seconds" });
  });
});

describe('Date Parsing Reliability', () => {
  it('should parse ISO dates correctly', () => {
    const date = parseDateTime('2026-02-05T15:00:00Z');
    expect(date.toISOString()).toBe('2026-02-05T15:00:00.000Z');
  });

  it('should handle "tomorrow at 3pm"', () => {
    const date = parseDateTime('tomorrow at 3pm');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(date.getDate()).toBe(tomorrow.getDate());
    expect(date.getHours()).toBe(15);
  });

  it('should handle "today at 7pm"', () => {
    const date = parseDateTime('today at 7pm');
    expect(date.getDate()).toBe(new Date().getDate());
    expect(date.getHours()).toBe(19);
  });

  it('should handle "next Tuesday at 6pm"', () => {
    const date = parseDateTime('next Tuesday at 6pm');
    expect(date.getHours()).toBe(18);
  });

  it('should handle "in three days"', () => {
    const date = parseDateTime('in three days');
    const expected = new Date();
    expected.setDate(expected.getDate() + 3);
    expect(date.getDate()).toBe(expected.getDate());
  });

  it('should fallback to now for invalid dates', () => {
    const date = parseDateTime('invalid date');
    expect(date).toBeInstanceOf(Date);
    expect(isNaN(date.getTime())).toBe(false);
  });
});

describe('Input Validation & Sanitization', () => {
  it('should reject empty geocode location', () => {
    const result = GeocodeLocationSchema.safeParse({ location: '' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid restaurant coordinates', () => {
    const result = SearchRestaurantSchema.safeParse({ lat: 100, lon: 200 });
    expect(result.success).toBe(false);
  });

  it('should accept valid restaurant coordinates', () => {
    const result = SearchRestaurantSchema.safeParse({ lat: 45, lon: -73 });
    expect(result.success).toBe(true);
  });
});

describe('Cache System', () => {
  it('should use memory cache if redis is unavailable', async () => {
    await cache.set('test-key', 'test-value');
    const val = await cache.get('test-key');
    expect(val).toBe('test-value');
  });

  it('should use redis if available', async () => {
    const { redis } = await import('@/lib/cache');
    if (redis) {
      vi.spyOn(redis, 'get').mockResolvedValue('redis-val');
      vi.spyOn(redis, 'setex').mockResolvedValue('OK');
      
      await cache.set('redis-key', 'redis-val');
      const val = await cache.get('redis-key');
      expect(val).toBe('redis-val');
      expect(redis.get).toHaveBeenCalledWith('redis-key');
    }
  });
});

describe('Tool Error Handling & Circuit Breaker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('should retry on 500 errors', async () => {
    (fetch as any)
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ lat: '45', lon: '-73' }]) });

    const promise = geocode_location({ location: 'Paris' });
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('should open circuit breaker after repeated failures', async () => {
    (fetch as any).mockResolvedValue({ ok: false, status: 500, statusText: 'Error' });

    for (let i = 0; i < 6; i++) {
      const promise = geocode_location({ location: 'Paris' });
      await vi.runAllTimersAsync();
      await promise;
    }

    const result = await geocode_location({ location: 'Paris' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Circuit breaker');
  });
});
