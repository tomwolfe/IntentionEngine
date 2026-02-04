import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { z } from "zod";
import { search_restaurant, add_calendar_event } from "@/lib/tools";
import { env } from "@/lib/config";

export const runtime = "edge";
export const maxDuration = 30;

const openai = createOpenAI({
  apiKey: env.LLM_API_KEY,
  baseURL: env.LLM_BASE_URL,
});

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

    console.log(`Received chat request with ${messages?.length || 0} messages`);

    if (messages.length === 0) {
      return new Response("No messages provided", { status: 400 });
    }

    const coreMessages = await convertToModelMessages(messages);

    const locationContext = userLocation 
      ? `The user is currently at latitude ${userLocation.lat}, longitude ${userLocation.lng}. Use these coordinates for 'nearby' requests.`
      : "The user's location is unknown. If they ask for 'nearby' or don't specify a location, ask for it.";

    const modelName = env.LLM_MODEL;
    console.log(`Using model: ${modelName} with base URL: ${env.LLM_BASE_URL}`);

    const result = streamText({
      model: openai.chat(modelName),
      messages: coreMessages,
      system: `You are an Intention Engine, a specialized assistant for planning and execution.
      Strict Rules:
      1. Use search_restaurant to find dining options.
      2. Use add_calendar_event to schedule events.
      3. ONLY output valid tool calls or concise natural language responses.
      4. If a location (lat/lon) is required but unknown, STOP and ask the user for their location or a city name.
      5. ${locationContext}
      6. For calendar events, ensure start_time and end_time are in valid ISO format.`,
      tools: {
        search_restaurant: tool({
          description: "Search for restaurants nearby based on cuisine and location.",
          inputSchema: z.object({
            cuisine: z.string().optional().describe("The type of cuisine, e.g. 'Italian', 'Sushi'"),
            lat: z.number().describe("The latitude coordinate"),
            lon: z.number().describe("The longitude coordinate"),
          }),
          execute: async (params: any) => {
            console.log("Executing search_restaurant", params);
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
            console.log("Executing add_calendar_event", params);
            return await add_calendar_event(params);
          },
        }),
      },
      stopWhen: stepCountIs(3),
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
