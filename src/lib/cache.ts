import { Redis } from "@upstash/redis";
import { LRUCache } from "lru-cache";
import { env } from "./config";

export const redis = (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

// In-memory fallback
const memoryCache = new LRUCache<string, any>({
  max: 500,
  ttl: 1000 * 60 * 60, // 1 hour default TTL
});

export const CACHE_TTLS = {
  RESTAURANTS: 86400, // 24 hours
};

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    if (redis) {
      try {
        return await redis.get<T>(key);
      } catch (err) {
        console.warn("Redis get failed, falling back to memory:", err);
      }
    }
    return (memoryCache.get(key) as T) || null;
  },

  async set(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
    if (redis) {
      try {
        await redis.setex(key, ttlSeconds, value);
      } catch (err) {
        console.warn("Redis set failed, falling back to memory:", err);
      }
    }
    memoryCache.set(key, value, { ttl: ttlSeconds * 1000 });
  },

  async clear(): Promise<void> {
    if (redis) {
      try {
        await redis.flushdb();
      } catch (err) {
        console.warn("Redis flushdb failed:", err);
      }
    }
    memoryCache.clear();
  }
};
