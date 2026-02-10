import { Redis } from "@upstash/redis";
import { Plan } from "./schema";
import { env } from "./config";

export interface AuditLog {
  id: string;
  timestamp: string;
  intent: string;
  plan?: Plan;
  validation_error?: string;
  steps: Array<{
    step_index: number;
    tool_name: string;
    status: "pending" | "executed" | "rejected" | "failed";
    input: any;
    output?: any;
    error?: string;
    confirmed_by_user?: boolean;
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

export async function createAuditLog(intent: string, plan?: Plan): Promise<AuditLog> {
  const id = Math.random().toString(36).substring(7);
  const log: AuditLog = {
    id,
    timestamp: new Date().toISOString(),
    intent,
    plan,
    steps: [],
  };

  if (redis) {
    await redis.set(`${AUDIT_LOG_PREFIX}${id}`, JSON.stringify(log), { ex: 86400 * 7 }); // Store for 7 days
  } else {
    console.warn("Redis not configured, audit log will not be persisted");
  }

  return log;
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
