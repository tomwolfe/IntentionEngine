import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool, stepCountIs } from "ai";
import { tools as libTools } from "@/lib/tools";

export const maxDuration = 60;

const openai = createOpenAI({
  apiKey: process.env.LLM_API_KEY,
  baseURL: process.env.LLM_BASE_URL || "https://api.z.ai/api/paas/v4",
});

export async function POST(req: Request) {
  const json = await req.json();
  let messages = json.messages;
  let userLocation = json.userLocation;

  // Handle case where a single message is sent as 'text' or 'content'
  if (!messages && (json.text || json.content)) {
    messages = [{ role: 'user', content: json.text || json.content }];
  } else if (messages && !Array.isArray(messages)) {
    messages = [messages];
  }

  const locationContext = userLocation 
    ? `The user is currently at latitude ${userLocation.lat}, longitude ${userLocation.lng}.`
    : "The user's location is unknown. Ask if needed.";

  const result = streamText({
    model: openai(process.env.LLM_MODEL || "glm-4.7-flash"),
    messages,
    stopWhen: stepCountIs(10),
    system: `You are the Intention Engine - a high-capability AI agent.

## Operating Instructions
1. **Interleaved Thinking**: ALWAYS start every response with a "Thinking" process. Explain what you've done, what you've learned from tool results, and what your next step is.
2. **Goal Tracking**: Use 'update_goal' at the start of a multi-step task and whenever you complete a major step.
3. **Memory**: Use 'update_user_context' whenever you learn something important about the user (preferences, names, recurring locations).
4. **Safety**: Always use 'add_calendar_event' with 'confirmed: false' first to show a draft.

## Context
${locationContext}

## Formatting
- Use Markdown for reasoning.
- Be concise but thorough.`,
    tools: {
      get_weather: tool({
        description: libTools.get_weather.description,
        inputSchema: libTools.get_weather.parameters,
        execute: libTools.get_weather.execute,
      }),
      web_search: tool({
        description: libTools.web_search.description,
        inputSchema: libTools.web_search.parameters,
        execute: libTools.web_search.execute,
      }),
      search_restaurant: tool({
        description: libTools.search_restaurant.description,
        inputSchema: libTools.search_restaurant.parameters,
        execute: libTools.search_restaurant.execute,
      }),
      add_calendar_event: tool({
        description: libTools.add_calendar_event.description,
        inputSchema: libTools.add_calendar_event.parameters,
        execute: libTools.add_calendar_event.execute,
      }),
      update_user_context: tool({
        description: libTools.update_user_context.description,
        inputSchema: libTools.update_user_context.parameters,
        execute: libTools.update_user_context.execute,
      }),
      update_goal: tool({
        description: libTools.update_goal.description,
        inputSchema: libTools.update_goal.parameters,
        execute: libTools.update_goal.execute,
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
