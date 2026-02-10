import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { env } from "./config";
import { Intent, IntentSchema } from "./schema";

const customOpenAI = createOpenAI({
  apiKey: env.LLM_API_KEY,
  baseURL: env.LLM_BASE_URL,
});

export interface IntentInferenceResult {
  intent: Intent;
  rawResponse: string;
}

/**
 * Infer intent from raw text.
 * Uses generateObject to ensure strict enforcement of the Intent interface.
 */
export async function inferIntent(text: string): Promise<IntentInferenceResult> {
  if (!text || text.trim().length === 0) {
    throw new Error("Input text is empty");
  }

  const { object } = await generateObject({
    model: customOpenAI(env.LLM_MODEL),
    schema: IntentSchema,
    system: `You are a precision Intent Inference Engine. 
Your task is to convert raw user text into a structured JSON Intent object.
- type: Categorize into SCHEDULE, SEARCH, ACTION, QUERY, PLANNING, or UNKNOWN.
- confidence: A score between 0 and 1.
- parameters: Extract key variables (e.g., dates, locations, topics).
- rawText: Exactly match the user's input.

Use PLANNING if the request requires multiple steps (e.g., finding a place and then scheduling it).`,
    prompt: text,
  });

  return {
    intent: object,
    rawResponse: JSON.stringify(object),
  };
}
