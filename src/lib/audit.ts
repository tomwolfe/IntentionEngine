import { Plan } from "./schema";
import { cache } from "./cache";
import { z } from "zod";

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
  final_outcome?: AuditOutcome | string;
}

const AUDIT_LOG_PREFIX = "audit_log:";

export async function createAuditLog(intent: string): Promise<AuditLog> {
  const id = Math.random().toString(36).substring(7);
  const log: AuditLog = {
    id,
    timestamp: new Date().toISOString(),
    intent,
    steps: [],
  };

  await cache.set(`${AUDIT_LOG_PREFIX}${id}`, log, 86400 * 7); // Store for 7 days

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
    await cache.set(`${AUDIT_LOG_PREFIX}${id}`, updated, 86400 * 7);
  }
}

export async function getAuditLog(id: string): Promise<AuditLog | undefined> {
  const data = await cache.get<AuditLog>(`${AUDIT_LOG_PREFIX}${id}`);
  return data || undefined;
}
