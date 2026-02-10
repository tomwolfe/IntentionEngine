import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { search_restaurant, add_calendar_event, web_search, get_weather } from "@/lib/tools";

export const maxDuration = 60;

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

  if (!messages && (json.text || json.content)) {
    messages = [{ role: 'user', content: json.text || json.content }];
  } else if (messages && !Array.isArray(messages)) {
    messages = [messages];
  }

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

  const finalMessages = messagesValidation.data;

  const locationContext = userLocation 
    ? `The user is currently at latitude ${userLocation.lat}, longitude ${userLocation.lng}. Use these coordinates for 'nearby' requests.`
    : "The user's location is unknown. If they ask for 'nearby' or don't specify a location, ask for it.";

  const result = streamText({
    model: openai(process.env.LLM_MODEL || "glm-4.7-flash"),
    messages: finalMessages as any,
    stopWhen: stepCountIs(10),
    system: `You are an Intention Engine - an AI assistant that helps users accomplish their goals through multi-step reasoning and tool usage.

## Core Principles

1. **Interleaved Thinking**: Before EVERY tool call, explicitly reason about:
   - What information you have
   - What you need to know
   - Why this specific tool is the right choice
   - What you expect to learn from it

2. **Step-by-Step Execution**: Break complex tasks into manageable steps. Use up to 10 steps to accomplish the user's goal.

3. **Adaptive Reasoning**: Based on tool results, adjust your approach. If something doesn't work, try an alternative.

## Available Tools

- **search_restaurant**: Find restaurants by cuisine and location (requires lat/lon)
- **add_calendar_event**: Add events to calendar (requires confirmation for safety)
- **web_search**: Search the web for general information
- **get_weather**: Get weather forecast for a location

## Confirmation Pattern

For **add_calendar_event**: Always present a draft first with requiresConfirmation: true. Wait for user confirmation before finalizing.

## Context
${locationContext}

If you don't know the user's location and need it for a tool, ask the user.

Remember: Think before you act. Show your reasoning, then execute.`,
    tools: {
      search_restaurant: tool({
        description: "Search for restaurants nearby based on cuisine and location. Prioritizes cuisine matches within 10km radius.",
        inputSchema: z.object({
          cuisine: z.string().optional().describe("The type of cuisine, e.g. 'Italian', 'Sushi'"),
          lat: z.number().describe("The latitude coordinate"),
          lon: z.number().describe("The longitude coordinate"),
        }),
        execute: async ({ cuisine, lat, lon }) => {
          return await search_restaurant({ cuisine, lat, lon });
        },
      }),
      add_calendar_event: tool({
        description: "Add an event to the user's calendar. ALWAYS returns a draft first that requires user confirmation.",
        inputSchema: z.object({
          title: z.string().describe("The title of the event"),
          start_time: z.string().describe("The start time in ISO format"),
          end_time: z.string().describe("The end time in ISO format"),
          location: z.string().optional().describe("The location of the event"),
          confirmed: z.boolean().optional().describe("Set to true only after user confirms"),
        }),
        execute: async ({ title, start_time, end_time, location, confirmed }) => {
          return await add_calendar_event({ title, start_time, end_time, location, confirmed });
        },
      }),
      web_search: tool({
        description: "Search the web for general information, news, facts, or research on any topic.",
        inputSchema: z.object({
          query: z.string().describe("The search query"),
          num_results: z.number().optional().describe("Number of results to return (default: 5)"),
        }),
        execute: async ({ query, num_results }) => {
          return await web_search({ query, num_results });
        },
      }),
      get_weather: tool({
        description: "Get weather forecast for a specific location including current conditions and multi-day forecast.",
        inputSchema: z.object({
          location: z.string().describe("The location (city name or address)"),
          days: z.number().optional().describe("Number of forecast days (default: 3, max: 7)"),
        }),
        execute: async ({ location, days }) => {
          return await get_weather({ location, days });
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    originalMessages: finalMessages as any,
  });
}
