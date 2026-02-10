import { Redis } from "@upstash/redis";
import { env } from "./config";

const redis = (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const RATE_LIMITS = {
  chat: 100,
  tool: {
    search_restaurant: 50,
    add_calendar_event: 20,
    geocode_location: 50,
    send_email: 10,
    generate_document: 10,
    lookup_data: 30,
  }
} as const;

export async function rateLimit(endpoint: string, identifier: string) {
  if (!redis) {
    console.warn("Redis not configured, skipping rate limiting.");
    return;
  }

  const key = `rate_limit:${endpoint}:${identifier}`;
  const current = await redis.incr(key);
  
  if (current === 1) {
    await redis.expire(key, 60);
  }

  const limit = endpoint === 'chat' 
    ? RATE_LIMITS.chat 
    : (RATE_LIMITS.tool[endpoint as keyof typeof RATE_LIMITS.tool] || RATE_LIMITS.chat);
  
  if (current > limit) {
    console.error(`Rate limit exceeded for ${endpoint} by ${identifier}`);
    throw new Error(`Rate limit exceeded for ${endpoint}. Please try again later.`);
  }
}

export async function getRateLimitStatus(endpoint: string, identifier: string) {
  if (!redis) return null;
  const key = `rate_limit:${endpoint}:${identifier}`;
  const current = await redis.get<number>(key) || 0;
  const limit = endpoint === 'chat' 
    ? RATE_LIMITS.chat 
    : (RATE_LIMITS.tool[endpoint as keyof typeof RATE_LIMITS.tool] || RATE_LIMITS.chat);
  return { current, limit, remaining: Math.max(0, limit - current) };
}
