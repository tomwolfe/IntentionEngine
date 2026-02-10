import { NextResponse } from 'next/server';
import { redis } from '@/lib/cache';
import { env } from '@/lib/config';
import { logger } from '@/lib/logger';

export const runtime = 'edge';

export async function GET() {
  const startTime = Date.now();
  const checks: Record<string, boolean> = {};

  try {
    // Check Redis connection
    if (redis) {
      try {
        const redisOk = await redis.ping();
        checks.redis = redisOk === 'PONG';
      } catch (error) {
        logger.error('Health check: Redis ping failed', error as Error);
        checks.redis = false;
      }
    } else {
      checks.redis = false;
    }

    // Check LLM API key is configured
    checks.llm = !!env.LLM_API_KEY;

    // Check Upstash credentials if Redis is configured
    checks.upstash = !!(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);

    const responseTime = Date.now() - startTime;
    const allHealthy = Object.values(checks).every(Boolean);

    const response = {
      status: allHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      services: checks,
      version: process.env.npm_package_version || '1.0.0',
      environment: env.NODE_ENV,
    };

    if (!allHealthy) {
      logger.warn('Health check: Some services are degraded', { checks });
    }

    return NextResponse.json(response, {
      status: allHealthy ? 200 : 503,
    });
  } catch (error) {
    logger.error('Health check failed', error as Error);
    
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Health check execution failed',
      },
      { status: 503 }
    );
  }
}
