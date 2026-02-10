import { Redis } from "@upstash/redis";
import { Plan } from "./schema";
import { env } from "./config";
import { AuditLog, FailureMemory } from "./types";

const redis = (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const AUDIT_LOG_PREFIX = "audit_log:";
const USER_LOGS_PREFIX = "user_logs:";

export async function createAuditLog(
  intent: string, 
  plan?: Plan, 
  userLocation?: { lat: number; lng: number },
  userId: string = "anonymous",
  parent_id?: string
): Promise<AuditLog> {
  const id = Math.random().toString(36).substring(7);
  const log: AuditLog = {
    id,
    parent_id,
    timestamp: new Date().toISOString(),
    intent,
    plan,
    userLocation,
    steps: [],
    toolExecutionLatencies: {
      latencies: {},
      totalToolExecutionTime: 0
    },
    replanned_count: 0
  };

  if (redis) {
    await redis.set(`${AUDIT_LOG_PREFIX}${id}`, JSON.stringify(log), { ex: 86400 * 7 }); // Store for 7 days
    
    // Track logs for this user
    try {
      await redis.lpush(`${USER_LOGS_PREFIX}${userId}`, id);
      await redis.ltrim(`${USER_LOGS_PREFIX}${userId}`, 0, 19); // Keep last 20 logs
    } catch (err) {
      console.warn("Failed to update user logs index:", err);
    }
  } else {
    console.warn("Redis not configured, audit log will not be persisted");
  }

  return log;
}

export async function getRelevantFailures(currentIntent: string, userId: string = "anonymous"): Promise<FailureMemory[]> {
  if (!redis) return [];

  try {
    const ids = await redis.lrange(`${USER_LOGS_PREFIX}${userId}`, 0, 19);
    if (!ids || ids.length === 0) return [];

    const logs = await Promise.all(ids.map(id => getAuditLog(id)));
    const keywords = currentIntent.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    
    const relevantFailures: FailureMemory[] = [];
    
    for (const log of logs) {
      if (!log || !log.steps) continue;
      
      for (const step of log.steps) {
        if (step.status === "failed") {
          const stepContext = `${step.tool_name} ${step.error} ${JSON.stringify(step.input)}`.toLowerCase();
          if (keywords.some(k => stepContext.includes(k))) {
            relevantFailures.push({
              intent_keywords: keywords,
              failed_tool_name: step.tool_name,
              error_message: step.error || "Unknown error",
              input_params: step.input,
              timestamp: step.timestamp,
              audit_log_id: log.id,
              remedy_suggestion: "Validate parameters or try an alternative tool if available."
            });
          }
        }
      }
    }
    
    return relevantFailures.slice(0, 5);
  } catch (err) {
    console.warn(`Failed to fetch relevant failures for ${userId}:`, err);
    return [];
  }
}

export async function getUserAuditLogs(userId: string, limit: number = 5): Promise<AuditLog[]> {
  if (!redis) return [];

  try {
    const ids = await redis.lrange(`${USER_LOGS_PREFIX}${userId}`, 0, limit - 1);
    if (!ids || ids.length === 0) return [];

    const logs = await Promise.all(ids.map(id => getAuditLog(id)));
    return logs.filter((log): log is AuditLog => !!log);
  } catch (err) {
    console.warn(`Failed to fetch audit logs for user ${userId}:`, err);
    return [];
  }
}

export async function updateAuditLog(id: string, update: Partial<AuditLog>): Promise<void> {
  if (redis) {
    const existing = await getAuditLog(id);
    if (existing) {
      const updated = { ...existing, ...update };
      await redis.set(`${AUDIT_LOG_PREFIX}${id}`, JSON.stringify(updated), { ex: 86400 * 7 });
    }
  }
}

export async function getAuditLog(id: string): Promise<AuditLog | undefined> {

  if (redis) {

    const data = await redis.get(`${AUDIT_LOG_PREFIX}${id}`);

    if (data) {

      return (typeof data === "string" ? JSON.parse(data) : data) as AuditLog;

    }

  }

  return undefined;

}
