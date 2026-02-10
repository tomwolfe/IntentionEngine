"use server";

import { registry, ExecuteToolResult } from "@/lib/tools";
import { getAuditLog, updateAuditLog, getUserAuditLogs, saveFailureMemory, updateToolHealth } from "@/lib/audit";
import { replan } from "@/lib/llm";
import { AuditLog } from "@/lib/types";

export async function executeToolWithContext(
  tool_name: string, 
  parameters: any, 
  context: { audit_log_id: string; step_index: number }
): Promise<ExecuteToolResult> {
  const toolDef = registry.getTool(tool_name);
  if (!toolDef) {
    throw new Error(`Tool ${tool_name} not found`);
  }

  const startTime = Date.now();
  let result: any;
  let attempts = 0;
  const maxRetries = 2;

  while (attempts < maxRetries) {
    try {
      result = await toolDef.execute(parameters);
      
      const technicalErrorKeywords = ["429", "500", "502", "503", "504", "network", "timeout", "fetch", "socket", "hang up", "overpass api error"];
      const isTechnicalError = !result.success && result.error && technicalErrorKeywords.some(k => result.error.toLowerCase().includes(k));

      if (isTechnicalError && attempts < maxRetries - 1) {
        throw new Error(result.error);
      }
      
      break; 
    } catch (error: any) {
      attempts++;
      const delay = Math.pow(2, attempts) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      if (attempts >= maxRetries) {
        result = { success: false, error: error.message || "Unknown error" };
      }
    }
  }

  const duration = Date.now() - startTime;
  
  // Track tool health
  await updateToolHealth(tool_name, duration, result.success, result.error);

  const log = await getAuditLog(context.audit_log_id);
  
  if (log) {
    const toolExecutionLatencies = log.toolExecutionLatencies || { latencies: {}, totalToolExecutionTime: 0 };
    const latencies = toolExecutionLatencies.latencies[tool_name] || [];
    latencies.push(duration);
    toolExecutionLatencies.latencies[tool_name] = latencies;
    toolExecutionLatencies.totalToolExecutionTime = (toolExecutionLatencies.totalToolExecutionTime || 0) + duration;

    const newStep = {
      step_index: context.step_index,
      tool_name,
      status: (result.success ? "executed" : "failed") as any,
      input: parameters,
      output: result.result,
      error: result.error,
      timestamp: new Date().toISOString(),
      latency: duration
    };

    const updatedSteps = [...log.steps.filter(s => s.step_index !== context.step_index), newStep];

    await updateAuditLog(context.audit_log_id, { 
      toolExecutionLatencies,
      steps: updatedSteps,
    });

    // Proactive Failure Learning
    if (!result.success) {
      const { generateRemedy } = await import("../lib/llm");
      const remedy = await generateRemedy(tool_name, result.error || "Unknown error", parameters);
      
      await saveFailureMemory(
        context.audit_log_id,
        tool_name,
        result.error || "Unknown error",
        parameters,
        log.intent,
        remedy
      );

      // Autonomous Re-planning
      let replanSummary = "";
      if ((log.replanned_count || 0) < 2) {
        try {
          console.log(`Triggering autonomous replan for ${tool_name} failure...`);
          const newPlan = await replan(
            log.intent,
            { ...log, steps: updatedSteps },
            context.step_index,
            result.error || "Unknown error",
            { parameters, result: result.result }
          );

          await updateAuditLog(context.audit_log_id, {
            plan: newPlan,
            replanned_count: (log.replanned_count || 0) + 1
          });
          
          replanSummary = `\nAutonomous Re-plan Generated: ${newPlan.summary}`;
        } catch (replanError) {
          console.error("Failed to generate autonomous replan:", replanError);
        }
      }

      // Append remedy to result error for LLM awareness
      result.error = `${result.error}\nRemedy Suggestion: ${remedy}${replanSummary}`;
    }
  }

  return result;
}

export async function getPlanWithAvoidance(intent: string, userId: string = "anonymous") {
    // Phase 2: Memory & Guardrails - Fetch last 5 logs and extract failed tools
    const recentLogs = await getUserAuditLogs(userId, 5);
    const avoidTools: string[] = [];
    
    for (const log of recentLogs) {
        if (log.steps) {
            for (const step of log.steps) {
                if (step.status === "failed") {
                    avoidTools.push(step.tool_name);
                }
            }
        }
    }
    
    // We'll pass this to intent inference/planning logic
    return {
        avoidTools: Array.from(new Set(avoidTools))
    };
}

export async function getProvider(intentType: string) {
    // Phase 3: Multi-Provider Support
    // Use GLM-4 for 'search' and 'booking' intents, but route 'analysis' intents to OpenAI.
    if (intentType === "ANALYSIS") {
        return {
            provider: "openai",
            apiKey: process.env.OPENAI_API_KEY || process.env.LLM_API_KEY,
            model: "gpt-4o", // Default to gpt-4o for analysis
            baseUrl: "https://api.openai.com/v1"
        };
    }
    
    return {
        provider: "glm",
        apiKey: process.env.LLM_API_KEY,
        model: process.env.LLM_MODEL || "glm-4.7-flash",
        baseUrl: process.env.LLM_BASE_URL || "https://api.z.ai/api/paas/v4"
    };
}
