import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool, stepCountIs, convertToModelMessages, generateObject } from "ai";
import { z } from "zod";
import { search_restaurant, add_calendar_event, geocode_location, getToolCapabilitiesPrompt, listTools } from "@/lib/tools";
import { env } from "@/lib/config";
import { inferIntent } from "@/lib/intent";
import { Redis } from "@upstash/redis";
import { getUserPreferences, updateUserPreferences } from "@/lib/preferences";

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
          getUserPreferences(userIp),
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
      inferenceLatencies: { intentInference: intentInferenceLatency },
      metadata: { learnedPreferences: userPreferences }
    });

    const locationContext = userLocation 
      ? `The user is currently at latitude ${userLocation.lat}, longitude ${userLocation.lng}.`
      : "The user's location is unknown.";

    // Memory Context
    const memoryContext = recentLogs.length > 0 
      ? `Recent interaction history:\n${recentLogs.map(l => `- Intent: ${l.intent}, Outcome: ${l.final_outcome || 'N/A'}`).join('\n')}`
      : "";

    // Logic driven by intent:
    // 1. Dynamic System Prompt (with tool capabilities injection)
    // 2. Filtered Toolset
    
    // Get dynamic tool capabilities for the system prompt
    const toolCapabilitiesPrompt = getToolCapabilitiesPrompt();
    
    let systemPrompt = `You are an Intention Engine.
    ${userPreferences ? `### Known User Facts:\n${JSON.stringify(userPreferences)}` : ""}

    Today's date is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
    The user's inferred intent is: ${intent.type} (Confidence: ${intent.confidence})
    Extracted Parameters: ${JSON.stringify(intent.parameters)}
    
    ${locationContext}

    ${memoryContext}

    ${failureWarnings}

    ${intent.type === 'CLARIFICATION_REQUIRED' ? `IMPORTANT: Your confidence in the user's intent is LOW. You MUST ask a clarification question. Explanation: "${intent.explanation}"` : ""}
    ${intent.type === 'CLARIFICATION_REQUIRED' ? `IMPORTANT: Required information is missing: ${intent.parameters.missingFields.join(", ")}. You MUST ask the user specifically for these missing details.` : ""}

    If a tool returns success: false, you MUST acknowledge the error and attempt to REPLAN. 
    Explain what went wrong and provide a modified plan or alternative action to the user.
    Do not simply repeat the same failed call.

    If a user request requires multiple steps (e.g., finding a place and then scheduling it), the intent is PLANNING.
    When intent is PLANNING:
    1. Acknowledge the multi-step goal.
    2. Outline a structured step-by-step plan to the user.
    3. Execute tools according to the plan.

    ${toolCapabilitiesPrompt}
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
      mobility_request: tool({
        description: "Authorized to perform real-time ride requests from mobility services. Can book rides with Uber, Tesla, and Lyft with full ride-hailing authority.",
        inputSchema: z.object({
          service: z.enum(["uber", "lyft", "tesla"]).describe("The mobility service to use (uber, lyft, or tesla)."),
          pickup_location: z.object({
            lat: z.number(),
            lon: z.number(),
            address: z.string().optional(),
          }).describe("The pickup location coordinates and optional address."),
          dropoff_location: z.object({
            lat: z.number(),
            lon: z.number(),
            address: z.string().optional(),
          }).describe("The dropoff location coordinates and optional address."),
          ride_type: z.enum(["economy", "premium", "xl"]).optional().describe("The type of ride (economy, premium, or xl)."),
        }),
        execute: async (params: any) => {
          console.log("Executing mobility_request", params);
          const result = await executeToolWithContext("mobility_request", params, {
            audit_log_id: auditLog.id,
            step_index: auditLog.steps.length
          });
          return result;
        },
      }),
      get_route_estimate: tool({
        description: "Authorized to access real-time routing data. Provides live drive time and distance estimates with traffic-aware calculations.",
        inputSchema: z.object({
          origin: z.object({
            lat: z.number(),
            lon: z.number(),
          }).describe("The starting location coordinates."),
          destination: z.object({
            lat: z.number(),
            lon: z.number(),
          }).describe("The destination location coordinates."),
          mode: z.enum(["driving", "walking", "transit"]).optional().describe("The mode of transportation."),
        }),
        execute: async (params: any) => {
          console.log("Executing get_route_estimate", params);
          const result = await executeToolWithContext("get_route_estimate", params, {
            audit_log_id: auditLog.id,
            step_index: auditLog.steps.length
          });
          return result;
        },
      }),
      reserve_table: tool({
        description: "Authorized to perform real-time restaurant reservations. Can finalize live table bookings with confirmation codes and full reservation authority.",
        inputSchema: z.object({
          restaurant_name: z.string().describe("The name of the restaurant."),
          restaurant_address: z.string().describe("The address of the restaurant."),
          date: z.string().describe("The date of the reservation (ISO 8601 format)."),
          time: z.string().describe("The time of the reservation."),
          party_size: z.number().describe("The number of people in the party."),
          contact_name: z.string().describe("The name for the reservation."),
          contact_phone: z.string().optional().describe("The phone number for the reservation."),
          special_requests: z.string().optional().describe("Any special requests for the reservation."),
        }),
        execute: async (params: any) => {
          console.log("Executing reserve_table", params);
          const result = await executeToolWithContext("reserve_table", params, {
            audit_log_id: auditLog.id,
            step_index: auditLog.steps.length
          });
          return result;
        },
      }),
      send_comm: tool({
        description: "Authorized to perform real-time communications. Can send live emails and SMS messages with full messaging authority.",
        inputSchema: z.object({
          type: z.enum(["email", "sms"]).describe("The type of communication (email or sms)."),
          to: z.string().describe("The recipient address or phone number."),
          subject: z.string().optional().describe("The subject line (for email)."),
          body: z.string().describe("The message body content."),
        }),
        execute: async (params: any) => {
          console.log("Executing send_comm", params);
          const result = await executeToolWithContext("send_comm", params, {
            audit_log_id: auditLog.id,
            step_index: auditLog.steps.length
          });
          return result;
        },
      }),
      get_weather: tool({
        description: "Authorized to access real-time weather data. Provides live forecasts and current conditions with full meteorological authority.",
        inputSchema: z.object({
          location: z.object({
            lat: z.number(),
            lon: z.number(),
          }).describe("The location coordinates for weather lookup."),
          type: z.enum(["current", "forecast"]).optional().describe("Whether to get current conditions or forecast."),
        }),
        execute: async (params: any) => {
          console.log("Executing get_weather", params);
          const result = await executeToolWithContext("get_weather", params, {
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

    // Mobility and route tools for transportation intents
    if (intentType === "MOBILITY" || intentType === "TRANSPORT" || intentType === "RIDE" || intentType === "UNKNOWN" || intentType === "PLANNING") {
      enabledTools.mobility_request = allTools.mobility_request;
      enabledTools.get_route_estimate = allTools.get_route_estimate;
    }

    // Weather tool for weather intents
    if (intentType === "WEATHER" || intentType === "UNKNOWN" || intentType === "PLANNING") {
      enabledTools.get_weather = allTools.get_weather;
    }

    // Reservation tool for booking intents
    if (intentType === "RESERVATION" || intentType === "BOOKING" || intentType === "UNKNOWN" || intentType === "PLANNING") {
      enabledTools.reserve_table = allTools.reserve_table;
    }

    // Communication tool for messaging intents
    if (intentType === "COMMUNICATION" || intentType === "MESSAGE" || intentType === "EMAIL" || intentType === "SMS" || intentType === "UNKNOWN" || intentType === "PLANNING") {
      enabledTools.send_comm = allTools.send_comm;
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
          
          // Phase 2: Post-execution preference extraction
          const anySuccess = currentLog?.steps.some(s => s.status === "executed");
          if (intent.type === "ACTION" && anySuccess) {
            await updateUserPreferences(userIp, intent.parameters);
            // Refresh preferences for logging
            const updatedPrefs = await getUserPreferences(userIp);
            await (await import("@/lib/audit")).updateAuditLog(auditLog.id, {
              metadata: { ...currentLog?.metadata, learnedPreferences: updatedPrefs }
            });
          }

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
