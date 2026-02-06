import { NextRequest, NextResponse } from 'next/server';
import { LRUCache } from 'lru-cache';

export const rateLimitCache = new LRUCache<string, number>({
  max: 1000,
  ttl: 60 * 1000, // 1 minute
});

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
