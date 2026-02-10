import { Redis } from "@upstash/redis";
import { env } from "./config";

const redis = (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const ANALYTICS_PREFIX = "analytics:";

export async function trackEvent(eventType: string, data: any) {
  if (!redis) return;

  const key = `${ANALYTICS_PREFIX}${eventType}:${new Date().toISOString().split('T')[0]}`;
  try {
    await redis.lpush(key, JSON.stringify({
      timestamp: new Date().toISOString(),
      ...data
    }));
    await redis.expire(key, 86400 * 30); // Keep for 30 days
  } catch (err) {
    console.error("Failed to track event:", err);
  }
}

export async function trackToolUsage(toolName: string, success: boolean) {
  await trackEvent("tool_usage", { toolName, success });
}

export async function trackUserIntent(intentType: string, confidence: number) {
  await trackEvent("user_intent", { intentType, confidence });
}
