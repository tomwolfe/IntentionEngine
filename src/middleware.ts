import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@/lib/cache';

// Create rate limiter with Upstash Redis
// 100 requests per hour per IP
const ratelimit = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, '1 h'),
      analytics: true,
    })
  : null;

export async function middleware(request: NextRequest) {
  // Only apply rate limiting to API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Skip rate limiting for health checks
    if (request.nextUrl.pathname === '/api/health') {
      return NextResponse.next();
    }

    // Get IP address
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : '127.0.0.1';

    if (ratelimit) {
      try {
        const { success, limit, reset, remaining } = await ratelimit.limit(ip);

        // Add rate limit headers
        const response = success
          ? NextResponse.next()
          : new NextResponse(
              JSON.stringify({ error: 'Too Many Requests. Please try again later.' }),
              {
                status: 429,
                headers: {
                  'Content-Type': 'application/json',
                  'X-RateLimit-Limit': limit.toString(),
                  'X-RateLimit-Remaining': remaining.toString(),
                  'X-RateLimit-Reset': reset.toString(),
                },
              }
            );

        return response;
      } catch (error) {
        console.warn('Rate limiting failed, allowing request:', error);
        return NextResponse.next();
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
