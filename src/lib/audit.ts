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
const FAILURE_MEMORY_PREFIX = "failure_memory:";
const TOOL_HEALTH_PREFIX = "tool_health:";

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

export async function saveFailureMemory(
  logId: string,
  failedToolName: string,
  errorMessage: string,
  inputParams: any,
  intent: string,
  remedy?: string
): Promise<void> {
  if (!redis) return;

  if (!remedy) {
    const { generateRemedy } = await import("./llm");
    remedy = await generateRemedy(failedToolName, errorMessage, inputParams);
  }
  
  const keywords = intent.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const failure: FailureMemory = {
    intent_keywords: keywords,
    failed_tool_name: failedToolName,
    error_message: errorMessage,
    input_params: inputParams,
    timestamp: new Date().toISOString(),
    remedy_suggestion: remedy,
    audit_log_id: logId
  };

  // Store failure memory indexed by keywords for retrieval
  const pipeline = redis.pipeline();
  for (const keyword of keywords) {
    pipeline.lpush(`${FAILURE_MEMORY_PREFIX}${keyword}`, JSON.stringify(failure));
    pipeline.ltrim(`${FAILURE_MEMORY_PREFIX}${keyword}`, 0, 4); // Keep last 5 failures per keyword
  }
  await pipeline.exec();
}

export async function getRelevantFailures(currentIntent: string, userId: string = "anonymous"): Promise<FailureMemory[]> {
  if (!redis) return [];

  try {
    const keywords = currentIntent.toLowerCase().split(/\W+/).filter(w => w.length > 3);
    const failures: FailureMemory[] = [];
    const seenLogIds = new Set<string>();

    for (const keyword of keywords) {
      const data = await redis.lrange(`${FAILURE_MEMORY_PREFIX}${keyword}`, 0, 2);
      if (data) {
        for (const item of data) {
          const failure = (typeof item === "string" ? JSON.parse(item) : item) as FailureMemory;
          if (!seenLogIds.has(failure.audit_log_id)) {
            failures.push(failure);
            seenLogIds.add(failure.audit_log_id);
          }
        }
      }
    }
    
    return failures.slice(0, 5);
  } catch (err) {
    console.warn(`Failed to fetch relevant failures for ${userId}:`, err);
    return [];
  }
}

export async function updateToolHealth(toolName: string, latency: number, success: boolean, error?: string): Promise<void> {
  if (!redis) return;

  const key = `${TOOL_HEALTH_PREFIX}${toolName}`;
  const healthRaw = await redis.get(key);
  let health: any = healthRaw ? (typeof healthRaw === "string" ? JSON.parse(healthRaw) : healthRaw) : {
    tool_name: toolName,
    success_rate: 1,
    total_executions: 0,
    average_latency_ms: 0
  };

  health.total_executions += 1;
  const successCount = (health.success_rate * (health.total_executions - 1)) + (success ? 1 : 0);
  health.success_rate = successCount / health.total_executions;
  health.average_latency_ms = ((health.average_latency_ms * (health.total_executions - 1)) + latency) / health.total_executions;
  
  if (!success) {
    health.last_failure_reason = error;
  }

  await redis.set(key, JSON.stringify(health), { ex: 86400 * 30 }); // Keep for 30 days
}

export async function getSystemStatus(): Promise<any> {
  if (!redis) return { overall_status: 'healthy', tools: {} };

  const keys = await redis.keys(`${TOOL_HEALTH_PREFIX}*`);
  const tools: Record<string, any> = {};
  let totalLatency = 0;
  let count = 0;

  for (const key of keys) {
    const health = await redis.get(key);
    if (health) {
      const toolHealth = typeof health === "string" ? JSON.parse(health) : health;
      tools[toolHealth.tool_name] = toolHealth;
      totalLatency += toolHealth.average_latency_ms;
      count++;
    }
  }

  const avgLatency = count > 0 ? totalLatency / count : 0;
  const overall_status = avgLatency > 2000 ? 'degraded' : 'healthy';

  return {
    tools,
    overall_status,
    average_latency_ms: avgLatency,
    last_updated: new Date().toISOString()
  };
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
