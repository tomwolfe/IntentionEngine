import { Redis } from "@upstash/redis";
import { Plan } from "./schema";
import { env } from "./config";

export interface AuditLog {
  id: string;
  version: number;
  timestamp: string;
  intent: string;
  plan?: Plan;
  planHistory?: Plan[];
  validation_error?: string;
  userContext?: {
    ip: string | null;
    userAgent: string | null;
  };
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

function redactSensitiveData(update: Partial<AuditLog>): Partial<AuditLog> {
  if (update.steps) {
    update.steps = update.steps.map(step => {
      if (step.tool_name === 'add_calendar_event' && step.output?.result?.download_url) {
        return {
          ...step,
          output: {
            ...step.output,
            result: {
              ...step.output.result,
              download_url: '[REDACTED]'
            }
          }
        };
      }
      return step;
    });
  }
  return update;
}

export async function createAuditLog(intent: string, userContext?: AuditLog['userContext']): Promise<AuditLog> {
  const id = Math.random().toString(36).substring(7);
  const log: AuditLog = {
    id,
    version: 1,
    timestamp: new Date().toISOString(),
    intent,
    steps: [],
    userContext,
    planHistory: [],
  };

  if (redis) {
    await redis.set(`${AUDIT_LOG_PREFIX}${id}`, JSON.stringify(log), { ex: 86400 * 7 });
  }

  return log;
}

export async function updateAuditLog(id: string, update: Partial<AuditLog>): Promise<void> {
  if (redis) {
    const existing = await getAuditLog(id);
    if (existing) {
      const redactedUpdate = redactSensitiveData(update);
      const updated = { ...existing, ...redactedUpdate };
      
      if (update.plan && update.plan !== existing.plan) {
        updated.planHistory = [...(existing.planHistory || []), existing.plan].filter(Boolean) as Plan[];
        updated.version = (existing.version || 1) + 1;
      }

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
