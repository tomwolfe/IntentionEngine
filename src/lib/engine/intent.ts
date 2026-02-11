/**
 * IntentionEngine - Intent Parser
 * Phase 3: Parse user input into structured, validated Intent
 * 
 * Constraints:
 * - No planning logic
 * - No execution logic
 * - No Redis calls
 * - Uses classification model for parsing
 * - Appends trace entry
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import {
  Intent,
  IntentSchema,
  IntentType,
  IntentTypeSchema,
  IntentMetadataSchema,
  TraceEntry,
  TraceEntrySchema,
  EngineErrorSchema,
} from "./types";
import { generateStructured, GenerateStructuredResult } from "./llm";

// ============================================================================
// PARSED INTENT SCHEMA (LLM Output)
// Schema for the raw LLM classification output
// ============================================================================

const ParsedIntentSchema = z.object({
  type: IntentTypeSchema,
  confidence: z.number().min(0).max(1),
  parameters: z.record(z.string(), z.unknown()),
  explanation: z.string(),
  requires_clarification: z.boolean().default(false),
  clarification_prompt: z.string().optional(),
});

export type ParsedIntent = z.infer<typeof ParsedIntentSchema>;

// ============================================================================
// PARSER CONTEXT
// Context passed to parser for classification
// ============================================================================

export interface ParseContext {
  execution_id?: string;
  user_context?: Record<string, unknown>;
  previous_intents?: Intent[];
  available_intent_types?: IntentType[];
}

// ============================================================================
// PARSER RESULT
// Result of intent parsing operation
// ============================================================================

export interface ParseResult {
  intent: Intent;
  trace_entry: TraceEntry;
  latency_ms: number;
  token_usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============================================================================
// SYSTEM PROMPT
// Instructions for the classification model
// ============================================================================

const INTENT_CLASSIFICATION_PROMPT = `You are an intent classification system. Your job is to analyze user input and classify it into a structured intent.

## Available Intent Types
- SCHEDULE: Calendar operations, scheduling meetings, booking appointments
- SEARCH: Finding information, looking up data, searching for items
- ACTION: Performing an action like sending email, making a call, creating a task
- QUERY: Asking for specific information or data retrieval
- PLANNING: Multi-step planning, trip planning, project planning
- ANALYSIS: Data analysis, summarization, comparison, evaluation
- UNKNOWN: Cannot determine intent from input
- CLARIFICATION_REQUIRED: Intent is ambiguous or incomplete

## Confidence Guidelines
- 0.9-1.0: Very clear, unambiguous intent
- 0.7-0.89: Clear intent with minor ambiguity
- 0.5-0.69: Moderate confidence, some ambiguity present
- 0.3-0.49: Low confidence, significant ambiguity
- 0.0-0.29: Very unclear, likely UNKNOWN or CLARIFICATION_REQUIRED

## Output Requirements
1. Always provide a confidence score between 0 and 1
2. Extract relevant parameters from the user input (dates, names, locations, etc.)
3. Provide a clear explanation of why this intent was chosen
4. Set requires_clarification to true if the user needs to provide more information
5. If clarification is needed, provide a specific prompt asking for the missing information

## Examples
Input: "Schedule a meeting with John tomorrow at 2pm"
Output: {
  "type": "SCHEDULE",
  "confidence": 0.95,
  "parameters": {
    "action": "create_meeting",
    "participants": ["John"],
    "date": "tomorrow",
    "time": "2pm"
  },
  "explanation": "User wants to create a calendar event with a specific person at a specific time",
  "requires_clarification": false
}

Input: "Find me a good restaurant"
Output: {
  "type": "SEARCH",
  "confidence": 0.75,
  "parameters": {
    "category": "restaurant",
    "criteria": "good"
  },
  "explanation": "User wants to search for restaurants, but 'good' is subjective and location is not specified",
  "requires_clarification": true,
  "clarification_prompt": "What type of cuisine are you looking for, and what area or neighborhood?"
}`;

// ============================================================================
// PARSE INTENT
// Main entry point: parses user input into validated Intent
// ============================================================================

export async function parseIntent(
  input: string,
  context: ParseContext = {}
): Promise<ParseResult> {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();

  try {
    // Validate input
    if (!input || typeof input !== "string" || input.trim().length === 0) {
      throw EngineErrorSchema.parse({
        code: "INTENT_PARSE_FAILED",
        message: "Invalid input: empty or non-string input provided",
        details: { input_type: typeof input },
        recoverable: false,
        timestamp,
      });
    }

    // Use LLM to classify intent
    const generationResult: GenerateStructuredResult<ParsedIntent> = await generateStructured({
      modelType: "classification",
      prompt: input,
      systemPrompt: INTENT_CLASSIFICATION_PROMPT,
      schema: ParsedIntentSchema,
      temperature: 0.1, // Low temperature for deterministic classification
      timeoutMs: 15000, // 15 second timeout for parsing
    });

    const parsedIntent = generationResult.data;
    const llmResponse = generationResult.response;

    // Build the canonical Intent
    const intent: Intent = IntentSchema.parse({
      id: randomUUID(),
      type: parsedIntent.type,
      confidence: parsedIntent.confidence,
      parameters: parsedIntent.parameters,
      raw_input: input.trim(),
      explanation: parsedIntent.explanation,
      metadata: IntentMetadataSchema.parse({
        version: "1.0.0",
        timestamp,
        source: "user_input",
        model_id: llmResponse.model_id,
        execution_id: context.execution_id,
      }),
      requires_clarification: parsedIntent.requires_clarification,
      clarification_prompt: parsedIntent.clarification_prompt,
    });

    const endTime = performance.now();
    const latencyMs = Math.round(endTime - startTime);

    // Create trace entry
    const traceEntry: TraceEntry = TraceEntrySchema.parse({
      timestamp,
      phase: "intent",
      event: "intent_parsed",
      input: { raw_input: input.trim(), context },
      output: intent,
      latency_ms: latencyMs,
      model_id: llmResponse.model_id,
      token_usage: {
        prompt_tokens: llmResponse.token_usage.prompt_tokens,
        completion_tokens: llmResponse.token_usage.completion_tokens,
        total_tokens: llmResponse.token_usage.total_tokens,
      },
    });

    return {
      intent,
      trace_entry: traceEntry,
      latency_ms: latencyMs,
      token_usage: {
        prompt_tokens: llmResponse.token_usage.prompt_tokens,
        completion_tokens: llmResponse.token_usage.completion_tokens,
        total_tokens: llmResponse.token_usage.total_tokens,
      },
    };
  } catch (error) {
    const endTime = performance.now();
    const latencyMs = Math.round(endTime - startTime);

    // If it's already an EngineError, re-throw it
    if (error && typeof error === "object" && "code" in error) {
      throw error;
    }

    // Wrap unexpected errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    throw EngineErrorSchema.parse({
      code: "INTENT_PARSE_FAILED",
      message: `Intent parsing failed: ${errorMessage}`,
      details: {
        input: input.slice(0, 100), // Truncate for safety
        latency_ms: latencyMs,
      },
      recoverable: false,
      timestamp,
    });
  }
}

// ============================================================================
// VALIDATE INTENT CONFIDENCE
// Helper to check if intent confidence meets threshold
// ============================================================================

export const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.9,
  MEDIUM: 0.7,
  LOW: 0.5,
  MINIMUM: 0.3,
} as const;

export function validateIntentConfidence(
  intent: Intent,
  minimumThreshold: number = CONFIDENCE_THRESHOLDS.MINIMUM
): { valid: boolean; reason?: string } {
  if (intent.confidence < minimumThreshold) {
    return {
      valid: false,
      reason: `Intent confidence ${intent.confidence} is below threshold ${minimumThreshold}`,
    };
  }

  if (intent.requires_clarification) {
    return {
      valid: false,
      reason: `Intent requires clarification: ${intent.clarification_prompt || "No clarification prompt provided"}`,
    };
  }

  if (intent.type === "UNKNOWN") {
    return {
      valid: false,
      reason: "Intent type is UNKNOWN",
    };
  }

  if (intent.type === "CLARIFICATION_REQUIRED") {
    return {
      valid: false,
      reason: `Clarification required: ${intent.clarification_prompt || "No clarification prompt provided"}`,
    };
  }

  return { valid: true };
}

// ============================================================================
// BATCH PARSE (for testing/validation)
// Parse multiple inputs in sequence
// ============================================================================

export async function parseIntentBatch(
  inputs: string[],
  context: ParseContext = {}
): Promise<ParseResult[]> {
  const results: ParseResult[] = [];

  for (const input of inputs) {
    const result = await parseIntent(input, context);
    results.push(result);
  }

  return results;
}
