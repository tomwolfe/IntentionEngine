import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { search_restaurant, add_calendar_event, geocode_location } from "@/lib/tools";
import { env } from "@/lib/config";
import { withReliability } from "@/lib/reliability";
import { ChatRequestSchema } from "@/lib/schema";
import { GeocodeLocationSchema, SearchRestaurantSchema, AddCalendarEventSchema } from "@/lib/validation-schemas";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const maxDuration = 30;

const openai = createOpenAI({
  apiKey: env.LLM_API_KEY,
  baseURL: env.LLM_BASE_URL,
});

export async function POST(req: NextRequest) {
  return withReliability(req, async () => {
    try {
      const rawBody = await req.json();
      const validatedBody = ChatRequestSchema.safeParse(rawBody);

      if (!validatedBody.success) {
        return NextResponse.json({ error: "Invalid request parameters", details: validatedBody.error.format() }, { status: 400 });
      }

      const { messages, userLocation, isSpecialIntent } = validatedBody.data;

      console.log(`Received chat request with ${messages?.length || 0} messages. Special Intent: ${isSpecialIntent}`);

      if (messages.length === 0) {
        return NextResponse.json({ error: "No messages provided" }, { status: 400 });
      }

      const messagesWithIds = messages.map((m) => ({
        ...m,
        id: m.id ?? Math.random().toString(),
        parts: m.parts ?? [{ type: "text", text: m.content ?? "" }],
      }));

      const coreMessages = await convertToModelMessages(messagesWithIds as any);

      const locationContext = userLocation 
        ? `The user is currently at latitude ${userLocation.lat}, longitude ${userLocation.lng}. Use these coordinates for 'nearby' requests.`
        : "The user's location is unknown. If they ask for 'nearby' or don't specify a location, ask for it.";

      const specialContext = isSpecialIntent 
        ? `The user has a 'special' intent. You MUST be invisible. 
           1. Skip all manual confirmations and intermediate chatter.
           2. Automatically choose the best restaurant using search_restaurant.
           3. Proceed to add_calendar_event immediately after search.
           4. Your final response MUST be a single, unified confirmation in this format: 
              "Your special dinner with [Person] is set for [Day] at [Time] at [Restaurant Name]. A bottle of [Suggested Wine] has been selected to elevate the evening. Your calendar is updated."
           5. Do NOT list multiple restaurants.`
        : "Restaurant search and user confirmation MUST precede calendar event creation. DO NOT add to calendar until the user has selected a specific restaurant.";

      const modelName = env.LLM_MODEL;
      console.log(`Using model: ${modelName} with base URL: ${env.LLM_BASE_URL}`);

      const result = streamText({
        model: openai.chat(modelName),
        messages: coreMessages,
        system: `You are an Intention Engine, a specialized assistant for planning and execution.
        
        CRITICAL RULES:
        1. ${specialContext}
        2. Always assume a 2-hour duration for dinner events unless specified otherwise.
        3. For romantic dinner requests (or if special intent is flagged):
           - Prioritize 'romantic' atmosphere in search and descriptions.
           - NEVER suggest pizza, Mexican, or fast food cuisine.
           - Set the 'romantic' parameter to true when searching.
        4. If a location (lat/lon) is required but unknown, use geocode_location first.
        5. ${locationContext}
        6. For calendar events, ensure start_time and end_time are in valid ISO format.
        7. When adding a calendar event for a restaurant, you MUST include 'restaurant_name' and 'restaurant_address' parameters.
        8. For special intents, do not ask questions. Make executive decisions based on the user's intent to "make it special".`,
        tools: {
          geocode_location: tool({
            description: "Converts a city or place name to lat/lon coordinates.",
            inputSchema: GeocodeLocationSchema,
            execute: async (params) => {
              console.log("Executing geocode_location", params);
              return await geocode_location(params);
            },
          }),
          search_restaurant: tool({
            description: "Search for restaurants nearby based on cuisine and location.",
            inputSchema: SearchRestaurantSchema,
            execute: async (params: any) => {
              console.log("Executing search_restaurant", params);
              return await search_restaurant({ ...params, isSpecialIntent });
            },
          }),
          add_calendar_event: tool({
            description: "Add an event to the user's calendar.",
            inputSchema: AddCalendarEventSchema,
            execute: async (params: any) => {
              console.log("Executing add_calendar_event", params);
              return await add_calendar_event(params);
            },
          }),
        },
        stopWhen: stepCountIs(5),
      });

      return result.toUIMessageStreamResponse({
        originalMessages: messagesWithIds as any,
      }) as NextResponse;
    } catch (error: any) {
      console.error("Error in chat route:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }, { timeoutMs: 15000, rateLimit: 10 }); // Increased timeout for chat streaming as it takes longer
}
