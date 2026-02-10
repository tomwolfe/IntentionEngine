import { Redis } from "@upstash/redis";
import { Plan } from "./schema";
import { env } from "./config";

export interface AuditLog {
  id: string;
  timestamp: string;
  intent: string;
  plan?: Plan;
  userLocation?: { lat: number; lng: number };
  rawModelResponse?: string;
  inferenceLatencies?: {
    intentInference?: number;
    planGeneration?: number;
    total?: number;
  };
  toolExecutionLatencies?: {
    latencies: { [tool_name: string]: number[] };
    totalToolExecutionTime?: number;
  };
  validation_error?: string;
  steps: Array<{
    step_index: number;
    tool_name: string;
    status: "pending" | "executed" | "rejected" | "failed";
    input: any;
    output?: any;
    error?: string;
    confirmed_by_user?: boolean;
    timestamp: string;
    latency?: number;
  }>;
  final_outcome?: string;
}

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
  userId: string = "anonymous"
): Promise<AuditLog> {
  const id = Math.random().toString(36).substring(7);
  const log: AuditLog = {
    id,
    timestamp: new Date().toISOString(),
    intent,
    plan,
    userLocation,
    steps: [],
    toolExecutionLatencies: {
      latencies: {},
      totalToolExecutionTime: 0
    }
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
