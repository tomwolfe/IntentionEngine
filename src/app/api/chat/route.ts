import { createOpenAI } from "@ai-sdk/openai";
import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { z } from "zod";
import { TOOLS } from "@/lib/tools";
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

    // Map the TOOLS registry to the format expected by Vercel AI SDK
    const aiTools: Record<string, any> = {};
    Object.values(TOOLS).forEach((t) => {
      aiTools[t.definition.name] = tool({
        description: t.definition.description,
        execute: async (params: any) => {
          console.log(`Executing tool: ${t.definition.name}`, params);
          return await t.execute(params);
        },
        // We use the zod schema from the tool definition
        // Note: parameters is expected to be a ZodObject
        inputSchema: t.definition.parameters,
      });
    });

    const result = streamText({
      model: openai.chat(modelName),
      messages: coreMessages,
      system: `You are an Intention Engine, a specialized assistant for planning and execution.
      Strict Rules:
      1. For dining requests followed by a calendar event, always search for the restaurant first, then add the event.
      2. Always assume a 2-hour duration for dinner events.
      3. ${locationContext}
      4. If a tool requires confirmation (like adding a calendar event), inform the user.
      5. Break down complex requests into multiple steps.`,
      tools: aiTools,
      stopWhen: stepCountIs(5),
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
