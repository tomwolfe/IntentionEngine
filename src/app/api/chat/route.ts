import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool, stepCountIs, convertToModelMessages, generateObject } from "ai";
import { z } from "zod";
import { search_restaurant, add_calendar_event, geocode_location } from "@/lib/tools";
import { env } from "@/lib/config";
import { inferIntent } from "@/lib/intent";
import { Redis } from "@upstash/redis";

export const runtime = "edge";
export const maxDuration = 30;

const openai = createOpenAI({
  apiKey: env.LLM_API_KEY,
  baseURL: env.LLM_BASE_URL,
});

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
      return new Response(JSON.stringify({ error: "Invalid request parameters", details: validatedBody.error.format() }), { 
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const { messages, userLocation } = validatedBody.data;

    if (messages.length === 0) {
      return new Response("No messages provided", { status: 400 });
    }

    const startTime = Date.now();

    // Stateful Memory: Retrieve user preferences from Redis
    const userIp = req.headers.get("x-forwarded-for") || "anonymous";
    const userPrefsKey = `prefs:${userIp}`;
    let userPreferences = null;
    let recentLogs: any[] = [];

    const { createAuditLog, updateAuditLog, getUserAuditLogs } = await import("@/lib/audit");
    const { executeToolWithContext, getPlanWithAvoidance, getProvider } = await import("@/app/actions");

    if (redis) {
      try {
        [userPreferences, recentLogs] = await Promise.all([
          redis.get(userPrefsKey),
          getUserAuditLogs(userIp, 10)
        ]);
      } catch (err) {
        console.warn("Failed to retrieve user data from Redis:", err);
      }
    }

    const coreMessages = await convertToModelMessages(messages);

    // Phase 4: Consume structured intent to drive logic
    const lastUserMessage = [...coreMessages].reverse().find(m => m.role === "user");
    let userText = "";
    if (typeof lastUserMessage?.content === "string") {
      userText = lastUserMessage.content;
    } else if (Array.isArray(lastUserMessage?.content)) {
      userText = lastUserMessage.content
        .filter(part => part.type === "text")
        .map(part => (part as any).text)
        .join("\n");
    }

    // Step 2: Semantic Memory & Proactive Retrieval (Phase 2 Upgrade)
    const getRelevantFailures = function(text: string, logs: any[]) {
      const keywords = text.toLowerCase().split(/\W+/).filter(w => w.length > 3);
      const failures: string[] = [];
      for (const log of logs) {
        if (log.steps) {
          for (const step of log.steps) {
            if (step.status === "failed") {
              const inputStr = JSON.stringify(step.input).toLowerCase();
              const hasOverlap = keywords.some(k => inputStr.includes(k));
              
              if (hasOverlap) {
                let specificWarning = `Previous attempt at ${step.tool_name} with parameters ${JSON.stringify(step.input)} failed with error: "${step.error}".`;
                
                // Specific advice based on tool and error
                if (step.tool_name === "search_restaurant" && step.input.location) {
                  specificWarning = `Previous attempt to search restaurants in "${step.input.location}" failed with "${step.error}"; try an alternative coordinate or broader search radius.`;
                } else if (step.tool_name === "geocode_location") {
                  specificWarning = `Previous attempt to geocode "${step.input.location}" failed; try providing a more specific city or landmark name.`;
                }
                
                failures.push(specificWarning);
              }
            }
          }
        }
      }
      return Array.from(new Set(failures)).slice(0, 3);
    }

    const relevantFailures = getRelevantFailures(userText, recentLogs);
    const failureWarnings = relevantFailures.length > 0
      ? `\n### DO NOT REPEAT THESE MISTAKES:\n${relevantFailures.map(f => `- ${f}`).join('\n')}`
      : "";

    let intent;
    let intentInferenceLatency = 0;
    let rawModelResponse = "";
    try {
      const intentStart = Date.now();
      const { avoidTools } = await getPlanWithAvoidance(userText, userIp);
      const inferenceResult = await inferIntent(userText, avoidTools);
      intentInferenceLatency = Date.now() - intentStart;
      intent = inferenceResult.hypotheses.primary;
      rawModelResponse = inferenceResult.rawResponse;
      console.log("[Phase 4] Structured Intent Inferred:", intent.type, "Confidence:", intent.confidence);
    } catch (e) {
      console.error("Intent inference failed, falling back to UNKNOWN", e);
      // Create a minimal valid intent object
      intent = { 
        id: crypto.randomUUID(),
        type: "UNKNOWN", 
        confidence: 0, 
        parameters: {}, 
        rawText: userText,
        metadata: { version: "1.0.0", timestamp: new Date().toISOString(), source: "error_fallback" }
      } as any;
    }

    // Initialize Audit Log
    const auditLog = await createAuditLog(intent, undefined, userLocation || undefined, userIp);
    await updateAuditLog(auditLog.id, { 
      rawModelResponse,
      inferenceLatencies: { intentInference: intentInferenceLatency }
    });

    const locationContext = userLocation 
      ? `The user is currently at latitude ${userLocation.lat}, longitude ${userLocation.lng}.`
      : "The user's location is unknown.";

    // Memory Context
    const memoryContext = recentLogs.length > 0 
      ? `Recent interaction history:\n${recentLogs.map(l => `- Intent: ${l.intent}, Outcome: ${l.final_outcome || 'N/A'}`).join('\n')}`
      : "";

    // Logic driven by intent:
    // 1. Dynamic System Prompt
    // 2. Filtered Toolset
    let systemPrompt = `You are an Intention Engine.
    Today's date is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
    The user's inferred intent is: ${intent.type} (Confidence: ${intent.confidence})
    Extracted Parameters: ${JSON.stringify(intent.parameters)}
    
    ${locationContext}

    ${userPreferences ? `User Preferences: ${JSON.stringify(userPreferences)}` : ""}

    ${memoryContext}

    ${failureWarnings}

    ${intent.type === 'CLARIFICATION_NEEDED' ? `IMPORTANT: Your confidence in the user's intent is LOW. You MUST ask a clarification question. Explanation: "${intent.explanation}"` : ""}

    If a tool returns success: false, you MUST acknowledge the error and attempt to REPLAN. 
    Explain what went wrong and provide a modified plan or alternative action to the user.
    Do not simply repeat the same failed call.

    If a user request requires multiple steps (e.g., finding a place and then scheduling it), the intent is PLANNING.
    When intent is PLANNING:
    1. Acknowledge the multi-step goal.
    2. Outline a structured step-by-step plan to the user.
    3. Execute tools according to the plan.
    `;

    const allTools = {
      geocode_location: tool({
        description: "Converts a city or place name to lat/lon coordinates.",
        inputSchema: z.object({
          location: z.string().describe("The city or place name to geocode."),
        }),
        execute: async (params) => {
          console.log("Executing geocode_location", params);
          const result = await executeToolWithContext("geocode_location", { ...params, userLocation: userLocation || undefined }, {
            audit_log_id: auditLog.id,
            step_index: auditLog.steps.length
          });
          return result;
        },
      }),
      search_restaurant: tool({
        description: "Search for restaurants nearby based on cuisine and location.",
        inputSchema: z.object({
          cuisine: z.string().optional(),
          lat: z.number().optional(),
          lon: z.number().optional(),
          location: z.string().optional(),
        }),
        execute: async (params: any) => {
          console.log("Executing search_restaurant", params);
          const result = await executeToolWithContext("search_restaurant", { ...params, userLocation: userLocation || undefined }, {
            audit_log_id: auditLog.id,
            step_index: auditLog.steps.length
          });

          // Persistence: Save cuisine preference if successful
          if (result.success && params.cuisine && redis) {
            try {
              const currentPrefs: any = await redis.get(userPrefsKey) || {};
              const preferredCuisines = new Set(currentPrefs.preferredCuisines || []);
              preferredCuisines.add(params.cuisine.toLowerCase());
              await redis.set(userPrefsKey, {
                ...currentPrefs,
                preferredCuisines: Array.from(preferredCuisines),
              }, { ex: 86400 * 30 });
            } catch (err) {
              console.warn("Failed to save preference:", err);
            }
          }
          
          return result;
        },
      }),
      add_calendar_event: tool({
        description: "Add one or more events to the calendar.",
        inputSchema: z.object({
          events: z.array(z.object({
            title: z.string(),
            start_time: z.string(),
            end_time: z.string(),
            location: z.string().optional(),
            restaurant_name: z.string().optional(),
            restaurant_address: z.string().optional(),
          })),
        }),
        execute: async (params: any) => {
          console.log("Executing add_calendar_event", params);
          const result = await executeToolWithContext("add_calendar_event", params, {
            audit_log_id: auditLog.id,
            step_index: auditLog.steps.length
          });
          return result;
        },
      }),
    };

    // Filter tools based on intent to minimize surface area (Phase 3: Tool Scoping)
    let enabledTools: any = {};
    const intentType = intent.type.toUpperCase();

    if (intentType === "SEARCH" || intentType === "RESTAURANT" || intentType === "UNKNOWN" || intentType === "PLANNING") {
      enabledTools.search_restaurant = allTools.search_restaurant;
      enabledTools.geocode_location = allTools.geocode_location;
    }
    
    // Only provide calendar tool if it's explicitly about scheduling, or planning, or unknown.
    // Specifically NOT provided for RESTAURANT intent in the first turn as per requirements.
    if (intentType === "SCHEDULE" || intentType === "UNKNOWN" || intentType === "PLANNING") {
      enabledTools.add_calendar_event = allTools.add_calendar_event;
    }

    if (intentType === "ACTION") {
      enabledTools = allTools; // Action can be anything
    }

    const providerConfig = await getProvider(intent.type);
    const customProvider = createOpenAI({
      apiKey: providerConfig.apiKey,
      baseURL: providerConfig.baseUrl,
    });

    const result = streamText({
      model: customProvider.chat(providerConfig.model),
      messages: coreMessages,
      system: systemPrompt,
      tools: enabledTools,
      stopWhen: stepCountIs(5),
      onFinish: async (event) => {
        const totalLatency = Date.now() - startTime;
        try {
          // Retrieve current log to preserve steps already logged in execute
          const currentLog = await (await import("@/lib/audit")).getAuditLog(auditLog.id);
          await (await import("@/lib/audit")).updateAuditLog(auditLog.id, {
            final_outcome: event.text,
            inferenceLatencies: {
              ...currentLog?.inferenceLatencies,
              total: totalLatency,
              planGeneration: totalLatency - (currentLog?.inferenceLatencies?.intentInference || 0)
            }
          });
        } catch (err) {
          console.error("Failed to update final audit log:", err);
        }
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
