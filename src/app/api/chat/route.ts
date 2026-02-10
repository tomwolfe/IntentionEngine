import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool, convertToModelMessages, stepCountIs } from "ai";
import { z } from "zod";
import { registry, geocode_location } from "@/lib/tools";
import { env } from "@/lib/config";
import { inferIntent } from "@/lib/intent";
import { Redis } from "@upstash/redis";
import { createAuditLog, updateAuditLog, getRelevantFailures, getAuditLog, getSystemStatus } from "@/lib/audit";
import { executeToolWithContext, getProvider } from "@/app/actions";

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

    // Step 1: Vectorized Failure Lookup & Remedy Retrieval
    const relevantFailures = await getRelevantFailures(userText, userIp);
    const remedySuggestions = relevantFailures
      .filter(f => f.remedy_suggestion)
      .map(f => f.remedy_suggestion!);

    // Step 2: Infer Intent with Lessons from the past
    const { intent, rawResponse: rawIntentResponse } = await inferIntent(userText, [], remedySuggestions);
    
    // Step 3: Speculative Execution (Proactive Retrieval)
    let speculativeGeoPromise: Promise<any> | null = null;
    if (intent.parameters?.location) {
      speculativeGeoPromise = geocode_location({ 
        location: intent.parameters.location, 
        userLocation: userLocation || undefined 
      });
    }

    const failureMemoryContext = relevantFailures.length > 0
      ? `\nLESSONS FROM PREVIOUS ATTEMPTS:\n${relevantFailures.map(f => `- Warning: Previous ${f.failed_tool_name} failed. Remedy: ${f.remedy_suggestion}`).join('\n')}`
      : "";

    // Step 4: Real-time System Heartbeat
    const health = await getSystemStatus();
    const latencyWarnings = Object.values(health.tools)
      .filter((t: any) => t.average_latency_ms > 2000 || t.success_rate < 0.8)
      .map((t: any) => `Warning: Tool ${t.tool_name} is ${t.average_latency_ms > 2000 ? 'slow' : 'unreliable'}. Prefer alternatives.`)
      .join('\n');

    const isSystemDegraded = health.overall_status === 'degraded' || health.average_latency_ms > 2000;

    // Step 5: Initialize Audit Log
    const auditLog = await createAuditLog(intent.type, undefined, userLocation || undefined, userIp);
    await updateAuditLog(auditLog.id, { 
      rawModelResponse: rawIntentResponse,
      inferenceLatencies: {
        intentInference: Date.now() - startTime
      }
    });

    // Step 6: Tool Definitions (Wrapped for Registry Pattern)
    const enabledTools: any = {};
    const registryTools = registry.getAllTools();

    for (const toolDef of registryTools) {
      // Deprioritize LOW efficiency tools
      const toolHealth = health.tools[toolDef.name];
      const isLowEfficiency = toolHealth && (toolHealth.success_rate < 0.7 || toolHealth.average_latency_ms > 5000);

      enabledTools[toolDef.name] = tool({
        description: isLowEfficiency ? `${toolDef.description} (NOTE: This tool is currently underperforming)` : toolDef.description,
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

    ${isSystemDegraded ? "SYSTEM NOTICE: Performance is currently degraded. Be concise and prioritize high-success tools." : ""}

    If a tool fails, explain the error and propose a recovery plan or alternative.
    `;

    const result = streamText({
      model: customProvider.chat(providerConfig.model),
      messages: coreMessages,
      system: systemPrompt,
      tools: enabledTools,
      stopWhen: stepCountIs(5),
      onFinish: async (event) => {
        const totalLatency = Date.now() - startTime;
        const currentLog = await getAuditLog(auditLog.id);
        
        // Efficiency Score: (Result Quality (binary 1/0 for now) / Total Latency in seconds)
        const quality = event.finishReason === 'stop' ? 1.0 : 0.5;
        const efficiencyScore = quality / (totalLatency / 1000);
        const efficiencyFlag = efficiencyScore < 0.2 ? "LOW" : undefined;
        
        await updateAuditLog(auditLog.id, {
          final_outcome: event.text,
          efficiency_score: efficiencyScore,
          efficiency_flag: efficiencyFlag,
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