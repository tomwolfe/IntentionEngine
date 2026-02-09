import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { search_restaurant, add_calendar_event, geocode_location, find_event, get_directions } from "@/lib/tools";
import { env } from "@/lib/config";
import { withReliability } from "@/lib/reliability";
import { cache } from "@/lib/cache";
import { ChatRequestSchema } from "@/lib/schema";
import { GeocodeLocationSchema, SearchRestaurantSchema, AddCalendarEventSchema, FindEventSchema, DirectionsSchema } from "@/lib/validation-schemas";
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

      const { messages, userLocation, isSpecialIntent, dnaCuisine } = validatedBody.data;

      const dnaContext = dnaCuisine 
        ? `The user's recent successful interaction involved ${dnaCuisine} cuisine. If their current request is vague (e.g., "somewhere nice", "dinner"), subtly bias your choice towards this cuisine without mentioning why. If they specify a cuisine, ignore this bias.`
        : "";

      console.log(`Received chat request with ${messages?.length || 0} messages. Special Intent: ${isSpecialIntent}. DNA: ${dnaCuisine || 'None'}`);

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
        ? `The user's current location is latitude ${userLocation.lat}, longitude ${userLocation.lng}. Use these coordinates as the default for all searches unless another location is explicitly mentioned.`
        : "The user's location is unknown. If they ask for 'nearby' or don't specify a location, ask for it.";

      const specialContext = isSpecialIntent 
        ? `The user has a 'special' intent. You are an Executive Orchestrator. 
           1. Be entirely invisible. Skip all manual confirmations and intermediate chatter.
           2. Automatically choose the best restaurant using search_restaurant.
           3. Proceed to add_calendar_event immediately after search.
           4. Assume all events last 2 hours.
           5. Use the user's current coordinates for search if available. If neither coordinates nor a location are provided, default to London.
           6. Your final response MUST be a single, unified confirmation.
           7. Do NOT list multiple restaurants.`
        : "Restaurant search and user confirmation MUST precede calendar event creation unless it's a special intent.";

      const modelName = env.LLM_MODEL;
      console.log(`Using model: ${modelName} with base URL: ${env.LLM_BASE_URL}`);

      const result = streamText({
        model: openai.chat(modelName),
        messages: coreMessages,
        system: `You are an Executive Orchestrator. Convert user intent into action.
        
        CRITICAL RULES:
        1. ${specialContext}
        2. Assume all events last 2 hours.
        3. Use the user's current coordinates for all searches unless they specify a different location. Default to London only if coordinates are unavailable and no location is specified.
        4. If 'isSpecialIntent' is true, do not ask questions; make executive tool choices.
        5. For romantic dinner requests:
           - Prioritize 'romantic' atmosphere in search and descriptions.
           - NEVER suggest pizza, Mexican, or fast food.
           - Set 'romantic' parameter to true.
        6. ${locationContext}
        7. ${dnaContext}
        8. For calendar events, include 'restaurant_name' and 'restaurant_address' in parameters.
        9. Return ONLY the final confirmation when complete.`,
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
            description: "Search for restaurants nearby based on cuisine and location. ALWAYS prioritize using 'lat' and 'lon' if available.",
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
          find_event: tool({
            description: "Find events, concerts, or activities near a location. Use for entertainment, nightlife, or local activities.",
            inputSchema: FindEventSchema,
            execute: async (params: any) => {
              console.log("Executing find_event", params);
              return await find_event(params);
            },
          }),
          get_directions: tool({
            description: "Get directions and travel information between two locations.",
            inputSchema: DirectionsSchema,
            execute: async (params: any) => {
              console.log("Executing get_directions", params);
              return await get_directions(params);
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
