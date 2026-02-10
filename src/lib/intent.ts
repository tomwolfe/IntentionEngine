import { generateText } from "ai";
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
 * Uses generateText + manual parse to ensure Phase 3 raw response access.
 */
export async function inferIntent(text: string): Promise<IntentInferenceResult> {
  if (!text || text.trim().length === 0) {
    throw new Error("Input text is empty");
  }

  const { text: rawResponse } = await generateText({
    model: customOpenAI(env.LLM_MODEL),
    system: `You are a precision Intent Inference Engine. 
Your task is to convert raw user text into a structured JSON Intent object.
- type: Categorize into SCHEDULE, SEARCH, ACTION, QUERY, PLANNING, or UNKNOWN.
- confidence: A score between 0 and 1.
- entities: Extract key variables (e.g., dates, locations, topics).
- rawText: Exactly match the user's input.

Use PLANNING if the request requires multiple steps (e.g., finding a place and then scheduling it).

Return ONLY valid JSON matching this schema:
{
  "type": "SCHEDULE" | "SEARCH" | "ACTION" | "QUERY" | "PLANNING" | "UNKNOWN",
  "confidence": number,
  "entities": Record<string, any>,
  "rawText": string
}`,
    prompt: text,
  });

  try {
    // Phase 2: Validate all LLM output against the schema
    const json = JSON.parse(rawResponse.trim().replace(/^```json\n?|\n?```$/g, ""));
    const intent = IntentSchema.parse(json);

    return {
      intent,
      rawResponse,
    };
  } catch (error: any) {
    // Phase 2: Reject invalid outputs deterministically
    console.error("[Intent Engine] Validation failed for raw response:", rawResponse);
    throw new Error(`Invalid intent structure: ${error.message}`);
  }
}
