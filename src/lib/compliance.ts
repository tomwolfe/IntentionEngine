import { Redis } from "@upstash/redis";
import { env } from "./config";

const redis = (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

export async function deleteUserData(userId: string) {
  if (!redis) return;
  
  console.log(`GDPR: Deleting all data for user ${userId}`);
  // In a real app, find all keys associated with this user and delete them
  const keys = await redis.keys(`audit_log:*${userId}*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

export async function exportUserData(userId: string) {
  if (!redis) return null;
  
  console.log(`GDPR: Exporting all data for user ${userId}`);
  // In a real app, find all keys associated with this user and return them
  return {
    userId,
    data: [],
    exportDate: new Date().toISOString(),
  };
}
