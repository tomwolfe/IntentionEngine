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
    if (redis) {
      try {
        userPreferences = await redis.get(userPrefsKey);
      } catch (err) {
        console.warn("Failed to retrieve user preferences from Redis:", err);
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

    let intent;
    let intentInferenceLatency = 0;
    let rawModelResponse = "";
    try {
      const intentStart = Date.now();
      const inferenceResult = await inferIntent(userText);
      intentInferenceLatency = Date.now() - intentStart;
      intent = inferenceResult.intent;
      rawModelResponse = inferenceResult.rawResponse;
      console.log("[Phase 4] Structured Intent Inferred:", intent.type, "Confidence:", intent.confidence);
    } catch (e) {
      console.error("Intent inference failed, falling back to UNKNOWN", e);
      intent = { type: "UNKNOWN", confidence: 0, entities: {}, rawText: userText };
    }

    // Initialize Audit Log
    const { createAuditLog, updateAuditLog } = await import("@/lib/audit");
    const auditLog = await createAuditLog(intent.type, undefined, userLocation || undefined);
    await updateAuditLog(auditLog.id, { 
      rawModelResponse,
      inferenceLatencies: { intentInference: intentInferenceLatency }
    });

    const locationContext = userLocation 
      ? `The user is currently at latitude ${userLocation.lat}, longitude ${userLocation.lng}.`
      : "The user's location is unknown.";

    // Logic driven by intent:
    // 1. Dynamic System Prompt
    // 2. Filtered Toolset
    let systemPrompt = `You are an Intention Engine.
    Today's date is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}.
    The user's inferred intent is: ${intent.type} (Confidence: ${intent.confidence})
    Extracted Entities: ${JSON.stringify(intent.entities)}
    
    ${locationContext}

    ${userPreferences ? `User Preferences: ${JSON.stringify(userPreferences)}` : ""}

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
        description: "Converts a city or place name to lat/lon coordinates. Use this when a specific location is mentioned but coordinates are unknown.",
        inputSchema: z.object({
          location: z.string().describe("The city or place name to geocode. Use 'nearby' if the user's current location is intended."),
        }),
        execute: async (params) => {
          const toolStartTime = Date.now();
          console.log("Executing geocode_location", params);
          const result = await geocode_location({ ...params, userLocation: userLocation || undefined });
          const toolLatency = Date.now() - toolStartTime;
          
          // Log tool execution
          const currentLog = await (await import("@/lib/audit")).getAuditLog(auditLog.id);
          const updatedLatencies = currentLog?.toolExecutionLatencies || {};
          const toolLatencies = updatedLatencies["geocode_location"] || [];
          
          await updateAuditLog(auditLog.id, {
            steps: [...(auditLog.steps || []), {
              step_index: auditLog.steps.length,
              tool_name: "geocode_location",
              status: result.success ? "executed" : "failed",
              input: params,
              output: result.result,
              error: result.error,
              timestamp: new Date().toISOString()
            }],
            toolExecutionLatencies: {
              ...updatedLatencies,
              "geocode_location": [...toolLatencies, toolLatency],
              totalToolExecutionTime: (updatedLatencies.totalToolExecutionTime || 0) + toolLatency
            }
          });

          return result;
        },
      }),
      search_restaurant: tool({
        description: "Search for restaurants nearby based on cuisine and location. Always prefer using lat/lon if available.",
        inputSchema: z.object({
          cuisine: z.string().optional().describe("The type of cuisine, e.g. 'Italian', 'Sushi'"),
          lat: z.number().optional().describe("The latitude coordinate"),
          lon: z.number().optional().describe("The longitude coordinate"),
          location: z.string().optional().describe("The city or place name if lat/lon are not available. Use 'nearby' if applicable."),
        }),
        execute: async (params: any) => {
          const toolStartTime = Date.now();
          console.log("Executing search_restaurant", params);
          const result = await search_restaurant({ ...params, userLocation: userLocation || undefined });
          const toolLatency = Date.now() - toolStartTime;
          
          // Log tool execution
          const currentLog = await (await import("@/lib/audit")).getAuditLog(auditLog.id);
          const updatedLatencies = currentLog?.toolExecutionLatencies || {};
          const toolLatencies = updatedLatencies["search_restaurant"] || [];

          await updateAuditLog(auditLog.id, {
            steps: [...(auditLog.steps || []), {
              step_index: auditLog.steps.length,
              tool_name: "search_restaurant",
              status: result.success ? "executed" : "failed",
              input: params,
              output: result.result,
              error: result.error,
              timestamp: new Date().toISOString()
            }],
            toolExecutionLatencies: {
              ...updatedLatencies,
              "search_restaurant": [...toolLatencies, toolLatency],
              totalToolExecutionTime: (updatedLatencies.totalToolExecutionTime || 0) + toolLatency
            }
          });

          // Persistence: Save cuisine preference if successful
          if (result.success && params.cuisine && redis) {
            try {
              const currentPrefs: any = await redis.get(userPrefsKey) || {};
              const preferredCuisines = new Set(currentPrefs.preferredCuisines || []);
              preferredCuisines.add(params.cuisine.toLowerCase());
              
              // Also save the last successful restaurant search result as a preference
              const lastResults = Array.isArray(result.result) ? result.result.slice(0, 3) : [];
              
              await redis.set(userPrefsKey, {
                ...currentPrefs,
                preferredCuisines: Array.from(preferredCuisines),
                lastSuccessfulSearch: {
                  cuisine: params.cuisine,
                  results: lastResults,
                  timestamp: new Date().toISOString()
                }
              }, { ex: 86400 * 30 }); // Save for 30 days
            } catch (err) {
              console.warn("Failed to save user preference to Redis:", err);
            }
          }
          
          return result;
        },
      }),
      add_calendar_event: tool({
        description: "Add an event to the user's calendar. Requires a title, start time, and end time.",
        inputSchema: z.object({
          title: z.string().describe("The title of the event"),
          start_time: z.string().describe("The start time MUST be a valid ISO 8601 string."),
          end_time: z.string().describe("The end time MUST be a valid ISO 8601 string."),
          location: z.string().optional().describe("The location of the event"),
          restaurant_name: z.string().optional().describe("Name of the restaurant"),
          restaurant_address: z.string().optional().describe("Address of the restaurant"),
        }),
        execute: async (params: any) => {
          const toolStartTime = Date.now();
          console.log("Executing add_calendar_event", params);
          
          // Temporal Awareness: Normalize relative dates to ISO strings
          const isISO = (str: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(str);
          
          if (!isISO(params.start_time) || !isISO(params.end_time)) {
            console.log("Normalizing relative dates...");
            try {
              const { object: normalized } = await generateObject({
                model: openai.chat(env.LLM_MODEL),
                system: `You are a temporal normalization expert. 
                Today is ${new Date().toISOString()}.
                Convert the provided start and end times into valid ISO 8601 strings.`,
                schema: z.object({
                  start_time: z.string(),
                  end_time: z.string(),
                }),
                prompt: `Normalize these times: Start: "${params.start_time}", End: "${params.end_time}"`,
              });
              params.start_time = normalized.start_time;
              params.end_time = normalized.end_time;
              console.log("Normalized dates:", params.start_time, params.end_time);
            } catch (err) {
              console.warn("Date normalization failed, proceeding with raw strings:", err);
            }
          }
          
          const result = await add_calendar_event(params);
          const toolLatency = Date.now() - toolStartTime;

          // Log tool execution
          const currentLog = await (await import("@/lib/audit")).getAuditLog(auditLog.id);
          const updatedLatencies = currentLog?.toolExecutionLatencies || {};
          const toolLatencies = updatedLatencies["add_calendar_event"] || [];

          await updateAuditLog(auditLog.id, {
            steps: [...(auditLog.steps || []), {
              step_index: auditLog.steps.length,
              tool_name: "add_calendar_event",
              status: result.success ? "executed" : "failed",
              input: params,
              output: result.result,
              error: result.error,
              timestamp: new Date().toISOString()
            }],
            toolExecutionLatencies: {
              ...updatedLatencies,
              "add_calendar_event": [...toolLatencies, toolLatency],
              totalToolExecutionTime: (updatedLatencies.totalToolExecutionTime || 0) + toolLatency
            }
          });

          return result;
        },
      }),
    };

    // Filter tools based on intent to minimize surface area (Phase 4 Logic)
    let enabledTools: any = {};
    if (intent.type === "SEARCH" || intent.type === "UNKNOWN" || intent.type === "PLANNING") {
      enabledTools.search_restaurant = allTools.search_restaurant;
      enabledTools.geocode_location = allTools.geocode_location;
    }
    if (intent.type === "SCHEDULE" || intent.type === "UNKNOWN" || intent.type === "PLANNING") {
      enabledTools.add_calendar_event = allTools.add_calendar_event;
    }
    if (intent.type === "ACTION") {
      enabledTools = allTools; // Action can be anything
    }

    const result = streamText({
      model: openai.chat(env.LLM_MODEL),
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
