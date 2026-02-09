import { Plan } from "./schema";
import { z } from "zod";
import { Redis } from "@upstash/redis";
import { env } from "./config";
import { cache } from "./cache";

const redis = (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

// In-memory fallback for idempotency in tests
const memoryIdempotency = new Map<string, string>();

export const AuditOutcomeSchema = z.object({
  status: z.enum(["SUCCESS", "FAILURE", "PARTIAL_SUCCESS"]),
  message: z.string(),
  latency_ms: z.number().optional(),
  tokens_used: z.number().optional(),
});

export type AuditOutcome = z.infer<typeof AuditOutcomeSchema>;

export interface AuditLog {
  id: string;
  timestamp: string;
  intent_hash: string;
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
  final_outcome?: AuditOutcome | string;
}

const AUDIT_LOG_PREFIX = "audit_log:";
const IDEMPOTENCY_PREFIX = "idempotency:";

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createAuditLog(intent: string): Promise<AuditLog> {
  // Steve Jobs: "Respectful Boundaries" - We remember the intent to serve, but we forget the person to protect.
  // No IP, no device ID, no tracking. Only the silent record of a fulfilled desire.
  const intentHash = await sha256(intent);
  const idempotencyKey = `${IDEMPOTENCY_PREFIX}${intentHash}`;

  if (redis) {
    const existingId = await redis.get<string>(idempotencyKey);
    if (existingId) {
      const existingLog = await getAuditLog(existingId);
      if (existingLog) return existingLog;
    }
  } else {
    const existingId = memoryIdempotency.get(idempotencyKey);
    if (existingId) {
      const existingLog = await getAuditLog(existingId);
      if (existingLog) return existingLog;
    }
  }

  const id = Math.random().toString(36).substring(7);
  const log: AuditLog = {
    id,
    timestamp: new Date().toISOString(),
    intent_hash: intentHash,
    steps: [],
  };

  // Persist the log using cache (which handles redis/memory fallback)
  await cache.set(`${AUDIT_LOG_PREFIX}${id}`, log, 86400); // 24 hours

  // Set idempotency key
  if (redis) {
    await redis.set(idempotencyKey, id, { ex: 60 });
  } else {
    memoryIdempotency.set(idempotencyKey, id);
    setTimeout(() => memoryIdempotency.delete(idempotencyKey), 60000);
  }

  return log;
}

export async function updateAuditLog(id: string, update: Partial<AuditLog>): Promise<void> {
  const existing = await getAuditLog(id);
  if (existing) {
    if (update.final_outcome && typeof update.final_outcome === "object") {
      try {
        AuditOutcomeSchema.parse(update.final_outcome);
      } catch (err) {
        console.error("Invalid audit outcome schema:", err);
        throw new Error("Invalid audit outcome schema");
      }
    }
    
    const updated = { ...existing, ...update };
    await cache.set(`${AUDIT_LOG_PREFIX}${id}`, updated, 86400);
  }
}

export async function getAuditLog(id: string): Promise<AuditLog | undefined> {
  const data = await cache.get<AuditLog>(`${AUDIT_LOG_PREFIX}${id}`);
  return data || undefined;
}