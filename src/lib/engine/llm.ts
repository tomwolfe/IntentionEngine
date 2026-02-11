/**
 * IntentionEngine - LLM Abstraction Layer
 * Phase 2: Structured generation, model routing, timeout, retry, tracking
 * 
 * Constraints:
 * - No UI dependencies
 * - No Redis calls
 * - No business logic
 * - Independent from planner/executor
 */

import { z } from "zod";
import { generateObject, generateText as aiGenerateText } from "ai";
import { openai } from "@ai-sdk/openai";
import {
  LLMModelType,
  LLMModelTypeSchema,
  LLMRequest,
  LLMResponse,
  LLMResponseSchema,
  EngineErrorSchema,
  EngineErrorCodeSchema,
} from "./types";

// ============================================================================
// MODEL ROUTING CONFIGURATION
// Maps model types to specific model IDs
// ============================================================================

interface ModelConfig {
  modelId: string;
  defaultTemperature: number;
  defaultMaxTokens: number;
  defaultTimeoutMs: number;
}

const MODEL_ROUTING: Record<LLMModelType, ModelConfig> = {
  classification: {
    modelId: "gpt-4o-mini",
    defaultTemperature: 0.1,
    defaultMaxTokens: 1000,
    defaultTimeoutMs: 10000,
  },
  planning: {
    modelId: "gpt-4o",
    defaultTemperature: 0.1,
    defaultMaxTokens: 4000,
    defaultTimeoutMs: 30000,
  },
  execution: {
    modelId: "gpt-4o-mini",
    defaultTemperature: 0.1,
    defaultMaxTokens: 2000,
    defaultTimeoutMs: 15000,
  },
  summarization: {
    modelId: "gpt-4o-mini",
    defaultTemperature: 0.2,
    defaultMaxTokens: 1500,
    defaultTimeoutMs: 10000,
  },
};

// ============================================================================
// SUMMARIZATION PROMPT
// Instructions for the summarization model
// ============================================================================

export const SUMMARIZATION_PROMPT = `You are a results summarization system. Your job is to take the outputs of various tool executions and provide a concise, accurate summary for the user.

## Rules
1. STRICT MAPPING (CRITICAL): You MUST strictly map tool outputs to their respective inputs. If tool call A was for "Tokyo" and tool call B was for "London", you MUST NOT mix their data.
2. NO HALLUCINATION: Only use data provided in the tool outputs. If a tool failed, timed out, or returned no data for a specific entity (e.g., "London"), explicitly state that the information for that entity is unavailable. NEVER invent or extrapolate data.
3. ENTITY COMPLETENESS: Ensure every entity mentioned in the User Intent is addressed in the summary, even if only to say data is missing.
4. CONCISE & STRUCTURED: Be brief and direct.
5. TABLE FORMAT: If the data involves multiple entities with similar attributes (e.g., weather for multiple cities, prices for multiple items), you MUST use a Markdown table.

## Input Context
User Intent: {intent}
Plan Summary: {plan_summary}
Tool Outputs: {tool_outputs}

## Output Requirements
- Provide a clear, structured summary.
- Address all requested entities.
- If using a table, columns should be clearly labeled.
- Maintain 100% fidelity to the source data.`;

// ============================================================================
// TIMEOUT UTILITIES
// Promise-based timeout wrapper
// ============================================================================

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  context: string
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new TimeoutError(`LLM request timed out after ${timeoutMs}ms: ${context}`));
    }, timeoutMs);
    
    // Cleanup timeout if promise resolves first
    promise.finally(() => clearTimeout(timeoutId)).catch(() => {});
  });

  return Promise.race([promise, timeoutPromise]);
}

// ============================================================================
// TOKEN USAGE EXTRACTOR
// Normalizes token usage across different LLM providers
// ============================================================================

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

function extractTokenUsage(usage: unknown): TokenUsage {
  // Handle Vercel AI SDK usage format
  if (usage && typeof usage === "object") {
    const u = usage as Record<string, unknown>;
    return {
      promptTokens: typeof u.promptTokens === "number" ? u.promptTokens : 0,
      completionTokens: typeof u.completionTokens === "number" ? u.completionTokens : 0,
      totalTokens: typeof u.totalTokens === "number" ? u.totalTokens : 0,
    };
  }
  
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };
}

// ============================================================================
// GENERATE STRUCTURED OUTPUT
// Returns Zod-validated structured data with retry on schema failure
// ============================================================================

export interface GenerateStructuredOptions<T> {
  modelType: LLMModelType;
  prompt: string;
  systemPrompt?: string;
  schema: z.ZodSchema<T>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  maxRetries?: number; // Default: 1 (max 1 retry as per constraints)
}

export interface GenerateStructuredResult<T> {
  data: T;
  response: LLMResponse;
}

export async function generateStructured<T>(
  options: GenerateStructuredOptions<T>
): Promise<GenerateStructuredResult<T>> {
  const {
    modelType,
    prompt,
    systemPrompt,
    schema,
    temperature,
    maxTokens,
    timeoutMs,
    maxRetries = 1,
  } = options;

  // Validate model type
  LLMModelTypeSchema.parse(modelType);

  const config = MODEL_ROUTING[modelType];
  const effectiveTimeout = timeoutMs ?? config.defaultTimeoutMs;
  const effectiveTemperature = temperature ?? config.defaultTemperature;
  const effectiveMaxTokens = maxTokens ?? config.defaultMaxTokens;

  let lastError: Error | null = null;
  let attempts = 0;

  while (attempts <= maxRetries) {
    const startTime = performance.now();
    attempts++;

    try {
      // Create abort controller for timeout
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), effectiveTimeout);

      const result = await generateObject({
        model: openai(config.modelId),
        schema,
        prompt,
        system: systemPrompt,
        temperature: effectiveTemperature,
        maxTokens: effectiveMaxTokens,
        abortSignal: abortController.signal,
      });

      clearTimeout(timeoutId);

      const latencyMs = Math.round(performance.now() - startTime);
      const tokenUsage = extractTokenUsage(result.usage);

      // Build LLMResponse
      const response: LLMResponse = {
        content: JSON.stringify(result.object),
        structured_output: result.object,
        model_id: config.modelId,
        latency_ms: latencyMs,
        token_usage: {
          prompt_tokens: tokenUsage.promptTokens,
          completion_tokens: tokenUsage.completionTokens,
          total_tokens: tokenUsage.totalTokens,
        },
        finish_reason: "stop",
      };

      // Validate response schema
      LLMResponseSchema.parse(response);

      return {
        data: result.object as T,
        response,
      };
    } catch (error) {
      const latencyMs = Math.round(performance.now() - startTime);
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if it's a schema validation error and we have retries left
      if (attempts <= maxRetries) {
        // Determine if it's a schema validation failure
        const isSchemaError = 
          lastError.message?.includes("schema") ||
          lastError.message?.includes("validation") ||
          lastError.name === "ZodError";

        if (isSchemaError) {
          console.warn(`Schema validation failed, retrying (attempt ${attempts}/${maxRetries + 1})...`);
          continue; // Retry
        }
      }

      // Not a schema error or no retries left - throw deterministic error
      const errorCode = lastError instanceof TimeoutError || lastError.name === "AbortError"
        ? "LLM_TIMEOUT"
        : "LLM_SCHEMA_VALIDATION_FAILED";

      const engineError = EngineErrorSchema.parse({
        code: errorCode,
        message: `LLM structured generation failed: ${lastError.message}`,
        details: {
          model_type: modelType,
          model_id: config.modelId,
          attempts,
          latency_ms: latencyMs,
          original_error: lastError.message,
        },
        recoverable: false,
        timestamp: new Date().toISOString(),
      });

      throw engineError;
    }
  }

  // Should never reach here, but ensure deterministic failure
  throw EngineErrorSchema.parse({
    code: "LLM_SCHEMA_VALIDATION_FAILED",
    message: `LLM structured generation failed after ${attempts} attempts: ${lastError?.message}`,
    details: {
      model_type: modelType,
      model_id: config.modelId,
      attempts,
    },
    recoverable: false,
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// GENERATE TEXT
// Returns plain text output without structured validation
// ============================================================================

export interface GenerateTextOptions {
  modelType: LLMModelType;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
}

export async function generateText(
  options: GenerateTextOptions
): Promise<LLMResponse> {
  const {
    modelType,
    prompt,
    systemPrompt,
    temperature,
    maxTokens,
    timeoutMs,
  } = options;

  // Validate model type
  LLMModelTypeSchema.parse(modelType);

  const config = MODEL_ROUTING[modelType];
  const effectiveTimeout = timeoutMs ?? config.defaultTimeoutMs;
  const effectiveTemperature = temperature ?? config.defaultTemperature;
  const effectiveMaxTokens = maxTokens ?? config.defaultMaxTokens;

  const startTime = performance.now();

  try {
    // Create abort controller for timeout
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), effectiveTimeout);

    const result = await aiGenerateText({
      model: openai(config.modelId),
      prompt,
      system: systemPrompt,
      temperature: effectiveTemperature,
      abortSignal: abortController.signal,
    });

    clearTimeout(timeoutId);

    const latencyMs = Math.round(performance.now() - startTime);
    const tokenUsage = extractTokenUsage(result.usage);

    const response: LLMResponse = {
      content: result.text,
      model_id: config.modelId,
      latency_ms: latencyMs,
      token_usage: {
        prompt_tokens: tokenUsage.promptTokens,
        completion_tokens: tokenUsage.completionTokens,
        total_tokens: tokenUsage.totalTokens,
      },
      finish_reason: result.finishReason === "length" ? "length" : "stop",
    };

    // Validate response schema
    LLMResponseSchema.parse(response);

    return response;
  } catch (error) {
    const latencyMs = Math.round(performance.now() - startTime);
    const err = error instanceof Error ? error : new Error(String(error));

    const errorCode = err instanceof TimeoutError || err.name === "AbortError"
      ? "LLM_TIMEOUT"
      : "LLM_REQUEST_FAILED";

    const engineError = EngineErrorSchema.parse({
      code: errorCode,
      message: `LLM text generation failed: ${err.message}`,
      details: {
        model_type: modelType,
        model_id: config.modelId,
        latency_ms: latencyMs,
        original_error: err.message,
      },
      recoverable: false,
      timestamp: new Date().toISOString(),
    });

    throw engineError;
  }
}

// ============================================================================
// LATENCY TRACKING UTILITIES
// Helper functions for tracking latency across multiple calls
// ============================================================================

export interface LatencyStats {
  totalLatencyMs: number;
  callCount: number;
  averageLatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
}

export function createLatencyTracker() {
  const latencies: number[] = [];

  return {
    record: (latencyMs: number) => {
      latencies.push(latencyMs);
    },
    getStats: (): LatencyStats => {
      if (latencies.length === 0) {
        return {
          totalLatencyMs: 0,
          callCount: 0,
          averageLatencyMs: 0,
          maxLatencyMs: 0,
          minLatencyMs: 0,
        };
      }

      return {
        totalLatencyMs: latencies.reduce((a, b) => a + b, 0),
        callCount: latencies.length,
        averageLatencyMs: Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
        maxLatencyMs: Math.max(...latencies),
        minLatencyMs: Math.min(...latencies),
      };
    },
    getLatencies: () => [...latencies],
  };
}

// ============================================================================
// TOKEN USAGE AGGREGATION
// Helper functions for aggregating token usage across multiple calls
// ============================================================================

export interface AggregatedTokenUsage {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  callCount: number;
}

export function aggregateTokenUsage(responses: LLMResponse[]): AggregatedTokenUsage {
  return responses.reduce(
    (acc, response) => ({
      totalPromptTokens: acc.totalPromptTokens + response.token_usage.prompt_tokens,
      totalCompletionTokens: acc.totalCompletionTokens + response.token_usage.completion_tokens,
      totalTokens: acc.totalTokens + response.token_usage.total_tokens,
      callCount: acc.callCount + 1,
    }),
    {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      callCount: 0,
    }
  );
}

// ============================================================================
// EXPORT CONFIGURATION
// Allow runtime configuration updates (for testing)
// ============================================================================

export function getModelConfig(modelType: LLMModelType): ModelConfig {
  return { ...MODEL_ROUTING[modelType] };
}

export function updateModelConfig(
  modelType: LLMModelType,
  updates: Partial<ModelConfig>
): void {
  MODEL_ROUTING[modelType] = {
    ...MODEL_ROUTING[modelType],
    ...updates,
  };
}

// Re-export types for convenience
export type { ModelConfig, TokenUsage, TimeoutError };
