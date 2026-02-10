import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool, convertToModelMessages } from "ai";
import { z } from "zod";
import { registry, geocode_location } from "@/lib/tools";
import { env } from "@/lib/config";
import { inferIntent } from "@/lib/intent";
import { Redis } from "@upstash/redis";
import { createAuditLog, updateAuditLog, getRelevantFailures, getAuditLog } from "@/lib/audit";
import { executeToolWithContext, getProvider } from "@/app/actions";
import { SystemHealth } from "@/lib/types";

export const runtime = "edge";
export const maxDuration = 30;

const redis = (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const ChatRequestSchema = z.object({
  messages: z.array(z.any()),
  userLocation: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).nullable().optional(),
});

// Pillar 2.2: Latency-Aware LLM Routing (Mock/Helper)
async function getSystemHealth(): Promise<SystemHealth> {
  // In a real system, this would come from a real-time monitor or Redis
  return {
    tools: {
      "search_restaurant": {
        tool_name: "search_restaurant",
        success_rate: 0.95,
        total_executions: 100,
        average_latency_ms: 2500
      }
    },
    overall_status: 'healthy',
    last_updated: new Date().toISOString()
  };
}

export async function POST(req: Request) {
  try {
    const rawBody = await req.json();
    const validatedBody = ChatRequestSchema.safeParse(rawBody);

    if (!validatedBody.success) {
      return new Response(JSON.stringify({ error: "Invalid request parameters" }), { status: 400 });
    }

    const { messages, userLocation } = validatedBody.data;
    const userIp = req.headers.get("x-forwarded-for") || "anonymous";
    const startTime = Date.now();

    const coreMessages = await convertToModelMessages(messages);
    const lastUserMessage = [...coreMessages].reverse().find(m => m.role === "user");
    const userText = typeof lastUserMessage?.content === "string" ? lastUserMessage.content : "";

    // Step 1: Infer Intent
    const { intent, rawResponse: rawIntentResponse } = await inferIntent(userText);
    
    // Step 2: Pillar 2.1 - Speculative Execution (Proactive Retrieval)
    let speculativeGeoPromise: Promise<any> | null = null;
    if (intent.parameters?.location) {
      speculativeGeoPromise = geocode_location({ 
        location: intent.parameters.location, 
        userLocation: userLocation || undefined 
      });
    }

    // Step 3: Pillar 1.2 - Vectorized Failure Lookup
    const relevantFailures = await getRelevantFailures(userText, userIp);
    const failureMemoryContext = relevantFailures.length > 0
      ? `\nLESSONS FROM PREVIOUS ATTEMPTS:\n${relevantFailures.map(f => `- Warning: Previous ${f.failed_tool_name} failed with error "${f.error_message}".`).join('\n')}`
      : "";

    // Step 4: Pillar 2.2 - Latency Monitoring
    const health = await getSystemHealth();
    const latencyWarnings = Object.values(health.tools)
      .filter(t => t.average_latency_ms > 2000)
      .map(t => `Warning: Tool ${t.tool_name} is currently slow. Prefer alternatives if possible.`)
      .join('\n');

    // Step 5: Initialize Audit Log
    const auditLog = await createAuditLog(intent.type, undefined, userLocation || undefined, userIp);
    await updateAuditLog(auditLog.id, { rawModelResponse: rawIntentResponse });

    // Step 6: Tool Definitions (Wrapped for Registry Pattern)
    const enabledTools: any = {};
    const registryTools = registry.getAllTools();

    for (const toolDef of registryTools) {
      enabledTools[toolDef.name] = tool({
        description: toolDef.description,
        inputSchema: toolDef.parameters,
        execute: async (params) => {
          // Check speculative result
          if (toolDef.name === "geocode_location" && speculativeGeoPromise) {
            const specResult = await speculativeGeoPromise;
            if (specResult.success) {
                console.log("Using speculative geocode result");
                return specResult;
            }
          }

          const result = await executeToolWithContext(toolDef.name, params, {
            audit_log_id: auditLog.id,
            step_index: (await getAuditLog(auditLog.id))?.steps.length || 0
          });

          if (!result.success) {
            // Pillar 1.3: Track re-plans
            const currentLog = await getAuditLog(auditLog.id);
            const newReplannedCount = (currentLog?.replanned_count || 0) + 1;
            await updateAuditLog(auditLog.id, { replanned_count: newReplannedCount });
            
            if (newReplannedCount >= 3) {
                return { success: false, error: "Critical failure: Maximum re-planning attempts reached. Please inform the user we cannot proceed." };
            }
          }

          return result;
        }
      });
    }

    const providerConfig = await getProvider(intent.type);
    const customProvider = createOpenAI({
      apiKey: providerConfig.apiKey,
      baseURL: providerConfig.baseUrl,
    });

    const systemPrompt = `You are an Intention Engine.
    Inferred Intent: ${intent.type} (Confidence: ${intent.confidence})
    Today is ${new Date().toLocaleDateString()}.
    
    ${userLocation ? `User Location: ${userLocation.lat}, ${userLocation.lng}` : ""}
    
    ${failureMemoryContext}
    ${latencyWarnings}

    If a tool fails, explain the error and propose a recovery plan or alternative.
    `;

    const result = streamText({
      model: customProvider.chat(providerConfig.model),
      messages: coreMessages,
      system: systemPrompt,
      tools: enabledTools,
      maxSteps: 5,
      onFinish: async (event) => {
        const totalLatency = Date.now() - startTime;
        const currentLog = await getAuditLog(auditLog.id);
        
        // Pillar 1.4: Efficiency Score
        const efficiencyScore = (event.text.length > 0 ? 1 : 0.5) / (totalLatency / 1000);
        
        await updateAuditLog(auditLog.id, {
          final_outcome: event.text,
          efficiency_score: efficiencyScore,
          inferenceLatencies: {
            ...currentLog?.inferenceLatencies,
            total: totalLatency,
            planGeneration: totalLatency - (currentLog?.inferenceLatencies?.intentInference || 0)
          }
        });
      }
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
    });
  } catch (error: any) {
    console.error("Error in chat route:", error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}