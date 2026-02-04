import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { search_restaurant, add_calendar_event } from "@/lib/tools";

export const maxDuration = 30;

const openai = createOpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL || "https://api.z.ai/api/paas/v4",
});

const ModelMessageSchema = z.union([
  z.object({
    role: z.literal("user"),
    content: z.string().optional(),
    parts: z.array(z.any()).optional(),
  }),
  z.object({
    role: z.literal("assistant"),
    content: z.string().optional(),
    parts: z.array(z.any()).optional(),
    tool_calls: z.array(z.any()).optional(),
  }),
  z.object({
    role: z.literal("system"),
    content: z.string().optional(),
  }),
  z.object({
    role: z.literal("tool"),
    content: z.string().optional(),
    tool_results: z.array(z.any()).optional(),
  }),
]);

export async function POST(req: Request) {
  const json = await req.json();
  console.log("Incoming request body:", JSON.stringify(json, null, 2));
  
  let messages = json.messages;
  let userLocation = json.userLocation;

  // Handle case where a single message is sent as 'text' or 'content'
  if (!messages && (json.text || json.content)) {
    messages = [{ role: 'user', content: json.text || json.content }];
  } else if (messages && !Array.isArray(messages)) {
    // Handle case where messages is a single object
    messages = [messages];
  }

  // Ensure messages is at least an empty array for validation
  const messagesToValidate = messages || [];

  const messagesValidation = z.array(ModelMessageSchema).safeParse(messagesToValidate);
  if (!messagesValidation.success) {
    console.error("Validation failed:", messagesValidation.error.format());
    return new Response(
      JSON.stringify({
        type: "error",
        errorText: `Invalid prompt: The messages do not match the ModelMessage[] schema. ${messagesValidation.error.message}`,
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Use the validated messages
  const finalMessages = messagesValidation.data;

  const locationContext = userLocation 
    ? `The user is currently at latitude ${userLocation.lat}, longitude ${userLocation.lng}. Use these coordinates for 'nearby' requests.`
    : "The user's location is unknown. If they ask for 'nearby' or don't specify a location, ask for it.";

  const result = streamText({
    model: openai(process.env.LLM_MODEL || "glm-4.7-flash"),
    messages: finalMessages as any,
    system: `You are a helpful assistant that can search for restaurants and add events to the user's calendar.
    Use search_restaurant to find places and add_calendar_event to schedule them.
    
    Context:
    ${locationContext}
    
    If you don't know the user's location and need it for a tool, ask the user.`,
    tools: {
      search_restaurant: tool({
        description: "Search for restaurants nearby based on cuisine and location.",
        inputSchema: z.object({
          cuisine: z.string().optional().describe("The type of cuisine, e.g. 'Italian', 'Sushi'"),
          lat: z.number().describe("The latitude coordinate"),
          lon: z.number().describe("The longitude coordinate"),
        }),
        execute: async (params: any) => {
          return await search_restaurant(params);
        },
      }),
      add_calendar_event: tool({
        description: "Add an event to the user's calendar.",
        inputSchema: z.object({
          title: z.string().describe("The title of the event"),
          start_time: z.string().describe("The start time in ISO format"),
          end_time: z.string().describe("The end time in ISO format"),
          location: z.string().optional().describe("The location of the event"),
        }),
        execute: async (params: any) => {
          return await add_calendar_event(params);
        },
      }),
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: finalMessages as any,
  });
}
