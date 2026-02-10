import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { z } from "zod";
import { search_restaurant, add_calendar_event, geocode_location, send_email, generate_document, lookup_data } from "@/lib/tools";
import { env } from "@/lib/config";
import { inferIntent } from "@/lib/intent";
import { rateLimit } from "@/lib/rate-limiter";
import { createAuditLog, updateAuditLog } from "@/lib/audit";
import { checkPermission } from "@/lib/tool-registry";
import { trackUserIntent, trackToolUsage } from "@/lib/analytics";

export const runtime = "edge";
export const maxDuration = 30;

const openai = createOpenAI({
  apiKey: env.LLM_API_KEY,
  baseURL: env.LLM_BASE_URL,
});

const ChatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant", "system", "tool"]),
    content: z.union([z.string(), z.array(z.any())]),
  })),
  userLocation: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).nullable().optional(),
});

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const userRole = req.headers.get("x-user-role") || "user";
  
  try {
    // 1. Rate Limiting
    try {
      await rateLimit("chat", ip);
    } catch (rlError: any) {
      return new Response(JSON.stringify({ error: rlError.message }), { 
        status: 429,
        headers: { "Content-Type": "application/json" }
      });
    }

    const rawBody = await req.json();
    const validatedBody = ChatRequestSchema.safeParse(rawBody);

    if (!validatedBody.success) {
      return new Response(JSON.stringify({ error: "Invalid request parameters", details: validatedBody.error.format() }), { 
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      });
    }

    const { messages, userLocation } = validatedBody.data;

    if (messages.length === 0) {
      return new Response("No messages provided", { status: 400 });
    }

    const coreMessages = await convertToModelMessages(messages as any);

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

    // Sanitize userText (basic example, can be more advanced)
    userText = userText.replace(/[<>]/g, "");

    let intent;
    try {
      const inferenceResult = await inferIntent(userText);
      intent = inferenceResult.intent;
      await trackUserIntent(intent.type, intent.confidence);
    } catch (e) {
      console.error("Intent inference failed, falling back to UNKNOWN", e);
      intent = { type: "UNKNOWN", confidence: 0, entities: {}, rawText: userText };
      await trackUserIntent("UNKNOWN", 0);
    }

    // 2. Audit Logging
    const auditLog = await createAuditLog(intent.type, {
      ip,
      userAgent: req.headers.get("user-agent"),
    });

    const locationContext = userLocation 
      ? `The user is currently at latitude ${userLocation.lat}, longitude ${userLocation.lng}.`
      : "The user's location is unknown.";

    let systemPrompt = `You are an Intention Engine.
    The user's inferred intent is: ${intent.type} (Confidence: ${intent.confidence})
    Extracted Entities: ${JSON.stringify(intent.entities)}
    
    ${locationContext}
    `;

    const allTools = {
      geocode_location: tool({
        description: "Converts a city or place name to lat/lon coordinates.",
        inputSchema: z.object({
          location: z.string().describe("The city or place name to geocode"),
        }),
        execute: async (params) => {
          if (!checkPermission("geocode_location", userRole)) throw new Error("Permission denied");
          console.log("Executing geocode_location", params);
          await rateLimit("geocode_location", ip);
          const result = await geocode_location(params);
          await trackToolUsage("geocode_location", result.success);
          await updateAuditLog(auditLog.id, {
            steps: [...(auditLog.steps || []), {
              step_index: auditLog.steps.length,
              tool_name: "geocode_location",
              status: result.success ? "executed" : "failed",
              input: params,
              output: result,
              error: result.success ? undefined : result.error,
            }]
          });
          return result;
        },
      }),
      search_restaurant: tool({
        description: "Search for restaurants nearby based on cuisine and location.",
        inputSchema: z.object({
          cuisine: z.string().optional().describe("The type of cuisine, e.g. 'Italian', 'Sushi'"),
          lat: z.number().optional().describe("The latitude coordinate"),
          lon: z.number().optional().describe("The longitude coordinate"),
          location: z.string().optional().describe("The city or place name if lat/lon are not available"),
        }),
        execute: async (params: any) => {
          if (!checkPermission("search_restaurant", userRole)) throw new Error("Permission denied");
          console.log("Executing search_restaurant", params);
          await rateLimit("search_restaurant", ip);
          const result = await search_restaurant(params);
          await updateAuditLog(auditLog.id, {
            steps: [...(auditLog.steps || []), {
              step_index: auditLog.steps.length,
              tool_name: "search_restaurant",
              status: result.success ? "executed" : "failed",
              input: params,
              output: result,
              error: result.success ? undefined : result.error,
            }]
          });
          return result;
        },
      }),
      add_calendar_event: tool({
        description: "Add an event to the user's calendar.",
        inputSchema: z.object({
          title: z.string().describe("The title of the event"),
          start_time: z.string().describe("The start time in ISO format"),
          end_time: z.string().describe("The end time in ISO format"),
          location: z.string().optional().describe("The location of the event"),
          restaurant_name: z.string().optional().describe("Name of the restaurant"),
          restaurant_address: z.string().optional().describe("Address of the restaurant"),
        }),
        execute: async (params: any) => {
          if (!checkPermission("add_calendar_event", userRole)) throw new Error("Permission denied");
          console.log("Executing add_calendar_event", params);
          await rateLimit("add_calendar_event", ip);
          const result = await add_calendar_event(params);
          await updateAuditLog(auditLog.id, {
            steps: [...(auditLog.steps || []), {
              step_index: auditLog.steps.length,
              tool_name: "add_calendar_event",
              status: result.success ? "executed" : "failed",
              input: params,
              output: result,
              error: result.success ? undefined : result.error,
            }]
          });
          return result;
        },
      }),
      send_email: tool({
        description: "Send an email to a recipient.",
        inputSchema: z.object({
          to: z.string().email().describe("Recipient email address"),
          subject: z.string().describe("Email subject"),
          body: z.string().describe("Email body content"),
        }),
        execute: async (params) => {
          if (!checkPermission("send_email", userRole)) throw new Error("Permission denied");
          console.log("Executing send_email", params);
          await rateLimit("send_email", ip);
          const result = await send_email(params);
          await updateAuditLog(auditLog.id, {
            steps: [...(auditLog.steps || []), {
              step_index: auditLog.steps.length,
              tool_name: "send_email",
              status: result.success ? "executed" : "failed",
              input: params,
              output: result,
              error: result.success ? undefined : result.error,
            }]
          });
          return result;
        },
      }),
      generate_document: tool({
        description: "Generate a document (pdf, txt, or markdown).",
        inputSchema: z.object({
          title: z.string().describe("Document title"),
          content: z.string().describe("Document content"),
          type: z.enum(["pdf", "txt", "markdown"]).default("txt").describe("Document type"),
        }),
        execute: async (params) => {
          if (!checkPermission("generate_document", userRole)) throw new Error("Permission denied");
          console.log("Executing generate_document", params);
          await rateLimit("generate_document", ip);
          const result = await generate_document(params);
          await updateAuditLog(auditLog.id, {
            steps: [...(auditLog.steps || []), {
              step_index: auditLog.steps.length,
              tool_name: "generate_document",
              status: result.success ? "executed" : "failed",
              input: params,
              output: result,
              error: result.success ? undefined : result.error,
            }]
          });
          return result;
        },
      }),
      lookup_data: tool({
        description: "Lookup data based on a query.",
        inputSchema: z.object({
          query: z.string().describe("The search query"),
          category: z.string().optional().describe("Optional category to narrow search"),
        }),
        execute: async (params) => {
          if (!checkPermission("lookup_data", userRole)) throw new Error("Permission denied");
          console.log("Executing lookup_data", params);
          await rateLimit("lookup_data", ip);
          const result = await lookup_data(params);
          await updateAuditLog(auditLog.id, {
            steps: [...(auditLog.steps || []), {
              step_index: auditLog.steps.length,
              tool_name: "lookup_data",
              status: result.success ? "executed" : "failed",
              input: params,
              output: result,
              error: result.success ? undefined : result.error,
            }]
          });
          return result;
        },
      }),
    };

    let enabledTools: any = {};
    if (intent.type === "SEARCH" || intent.type === "UNKNOWN") {
      enabledTools.search_restaurant = allTools.search_restaurant;
      enabledTools.geocode_location = allTools.geocode_location;
      enabledTools.lookup_data = allTools.lookup_data;
    }
    if (intent.type === "SCHEDULE" || intent.type === "UNKNOWN") {
      enabledTools.add_calendar_event = allTools.add_calendar_event;
    }
    if (intent.type === "ACTION" || intent.type === "UNKNOWN") {
      enabledTools.send_email = allTools.send_email;
      enabledTools.generate_document = allTools.generate_document;
    }
    if (intent.type === "ACTION") {
      enabledTools = allTools;
    }

    const result = streamText({
      model: openai.chat(env.LLM_MODEL),
      messages: coreMessages,
      system: systemPrompt,
      tools: enabledTools,
      stopWhen: stepCountIs(5),
      onFinish: async (event) => {
        await updateAuditLog(auditLog.id, {
          final_outcome: event.text,
        });
      },
    });

    return result.toUIMessageStreamResponse({
      originalMessages: messages as any,
    });
  } catch (error: any) {
    console.error("Error in chat route:", error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      }
    });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
