/**
 * IntentionEngine - API Layer
 * Phase 9: HTTP API for execution orchestration
 *
 * Flow:
 * 1. Create executionId
 * 2. Transition to RECEIVED
 * 3. Parse intent
 * 4. If needed, generate plan
 * 5. Execute
 * 6. Update memory
 * 7. Return structured result + trace
 *
 * Constraints:
 * - No business logic in route
 * - Only orchestration
 * - Route thin
 * - All logic in engine
 * - Trace returned
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";

// Engine imports
import {
  ExecutionState,
  ExecutionStatus,
  Intent,
  Plan,
  ExecutionTrace,
  EngineErrorSchema,
} from "@/lib/engine/types";
import { parseIntent, ParseResult, validateIntentConfidence } from "@/lib/engine/intent";
import { generatePlan, PlannerResult } from "@/lib/engine/planner";
import { generateText } from "@/lib/engine/llm";
import {
  ExecutionOrchestrator,
  ExecutionResult,
  ToolExecutor,
} from "@/lib/engine/orchestrator";
import {
  createInitialState,
  transitionState,
  applyStateUpdate,
  setIntent,
  setPlan,
} from "@/lib/engine/state-machine";
import { saveExecutionState, loadExecutionState, getMemoryClient } from "@/lib/engine/memory";
import {
  ExecutionTracer,
  createTracer,
  TracerResult,
} from "@/lib/engine/tracing";
import {
  getToolRegistry,
  ToolFunction,
  ToolExecutionContext,
} from "@/lib/engine/tools/registry";

// ============================================================================
// REQUEST/RESPONSE SCHEMAS
// Validation schemas for API
// ============================================================================

const ExecuteRequestSchema = z.object({
  input: z.string().min(1).max(10000),
  context: z
    .object({
      execution_id: z.string().optional(),
      user_context: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
  options: z
    .object({
      skip_planning: z.boolean().optional(),
      require_confirmation: z.boolean().optional(),
    })
    .optional(),
});

const ExecuteResponseSchema = z.object({
  success: z.boolean(),
  execution_id: z.string(),
  status: z.string(),
  intent: z.unknown().optional(),
  plan: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
  trace: z.unknown(),
  metadata: z.object({
    duration_ms: z.number(),
    total_tokens: z.number(),
    step_count: z.number().optional(),
    trace_id: z.string(),
    total_ms: z.number(),
  }),
});

// ============================================================================
// CREATE TOOL EXECUTOR
// Factory for tool executor using the registry
// ============================================================================

function createToolExecutorForExecution(
  executionId: string
): ToolExecutor {
  const registry = getToolRegistry();

  return {
    execute: async (
      toolName: string,
      parameters: Record<string, unknown>,
      timeoutMs: number
    ) => {
      const result = await registry.execute(
        toolName,
        parameters,
        {
          executionId,
          stepId: "unknown",
          timeoutMs,
          startTime: performance.now(),
        },
        undefined // Use latest version
      );

      return {
        success: result.success,
        output: result.output,
        error: result.error,
        latency_ms: result.latency_ms,
      };
    },
  };
}

// ============================================================================
// ORCHESTRATION ENGINE
// Main execution orchestration (business logic)
// ============================================================================

interface OrchestrationResult {
  success: boolean;
  execution_id: string;
  status: ExecutionStatus;
  intent?: Intent;
  plan?: Plan;
  execution_result?: ExecutionResult;
  error?: {
    code: string;
    message: string;
  };
  trace: ExecutionTrace;
  metadata: {
    duration_ms: number;
    total_tokens: number;
    step_count?: number;
    trace_id: string;
    total_ms: number;
  };
}

import { getRegistryManager } from "@/lib/engine/registry";

// ... existing imports ...

async function orchestrateExecution(
  input: string,
  context: { execution_id?: string; user_context?: Record<string, unknown> } = {},
  options: { skip_planning?: boolean; require_confirmation?: boolean } = {}
): Promise<OrchestrationResult> {
  const startTime = performance.now();
  const executionId = context.execution_id || randomUUID();

  // Initialize Registry and Discovery
  const registryManager = getRegistryManager();
  await registryManager.discoverRemoteTools();

  // Initialize tracer
  const tracer = createTracer(executionId);
  tracer.addSystemEntry("execution_started", { input: input.slice(0, 100) });

  try {
    // Step 1: Create initial state
    let state = createInitialState(executionId);
    tracer.addStateTransitionEntry("none", "RECEIVED", true);

    // Persist initial state
    await saveExecutionState(state);

    // Step 2: Parse intent
    tracer.addSystemEntry("parsing_intent");
    const parseResult: ParseResult = await parseIntent(input, {
      execution_id: executionId,
      user_context: context.user_context,
    });

    // Add intent trace entry
    tracer.addIntentEntry(
      input,
      parseResult.intent,
      parseResult.latency_ms,
      parseResult.intent.metadata.model_id || "unknown",
      {
        prompt: parseResult.token_usage.prompt_tokens,
        completion: parseResult.token_usage.completion_tokens,
      }
    );

    // Update state with intent
    state = setIntent(state, parseResult.intent);
    await saveExecutionState(state);

    // Validate intent confidence and type
    const validation = validateIntentConfidence(parseResult.intent);
    
    if (!validation.valid) {
      tracer.addSystemEntry("intent_rejected", {
        reason: validation.reason,
      });

      const traceResult = tracer.finalize();

      return {
        success: false,
        execution_id: executionId,
        status: "REJECTED",
        intent: parseResult.intent,
        error: {
          code: "INTENT_VALIDATION_FAILED",
          message: validation.reason || "Intent validation failed",
        },
        trace: traceResult.trace,
        metadata: {
          duration_ms: Math.round(performance.now() - startTime),
          total_tokens: traceResult.totalTokenUsage.totalTokens,
          trace_id: executionId,
          total_ms: Math.round(performance.now() - startTime),
        },
      };
    }

    // Check if intent requires clarification
    if (parseResult.intent.requires_clarification) {
      tracer.addSystemEntry("clarification_required", {
        prompt: parseResult.intent.clarification_prompt,
      });

      const traceResult = tracer.finalize();

      return {
        success: false,
        execution_id: executionId,
        status: "REJECTED",
        intent: parseResult.intent,
        error: {
          code: "CLARIFICATION_REQUIRED",
          message:
            parseResult.intent.clarification_prompt ||
            "Additional information needed",
        },
        trace: traceResult.trace,
        metadata: {
          duration_ms: Math.round(performance.now() - startTime),
          total_tokens: traceResult.totalTokenUsage.totalTokens,
          trace_id: executionId,
          total_ms: Math.round(performance.now() - startTime),
        },
      };
    }

    // Step 3: Generate plan (unless skipped)
    let plan: Plan | undefined;
    if (!options.skip_planning) {
      tracer.addSystemEntry("generating_plan");
      const planResult: PlannerResult = await generatePlan(parseResult.intent, {
        execution_id: executionId,
        available_tools: registryManager.listAllTools(),
      });

      // Add planning trace entry
      tracer.addPlanningEntry(
        { intent_type: parseResult.intent.type },
        { plan_id: planResult.plan.id, steps: planResult.plan.steps.length },
        planResult.latency_ms,
        planResult.trace_entry.model_id || "unknown",
        {
          prompt: planResult.token_usage.prompt_tokens,
          completion: planResult.token_usage.completion_tokens,
        }
      );

      plan = planResult.plan;
      state = setPlan(state, plan);
      await saveExecutionState(state);
    }

    // Step 4: Execute plan
    if (plan) {
      tracer.addSystemEntry("executing_plan", {
        step_count: plan.steps.length,
      });

      const toolExecutor = createToolExecutorForExecution(executionId);
      const orchestrator = new ExecutionOrchestrator(toolExecutor, {
        traceCallback: (entry) => {
          // Forward trace entries to our tracer
          if (entry.step_id) {
            tracer.addExecutionEntry(
              entry.step_id,
              entry.event as any,
              entry.input,
              entry.output,
              entry.error as string,
              entry.latency_ms
            );
          }
        },
      });

      const executionResult: ExecutionResult = await orchestrator.execute(
        plan,
        executionId
      );

      // Add completion trace entry
      tracer.addSystemEntry("execution_completed", {
        success: executionResult.success,
        completed_steps: executionResult.completed_steps,
        failed_steps: executionResult.failed_steps,
      });

      // Phase 3: Session Summary Generation
      try {
        const sessionSummaryPrompt = `Generate a 1-sentence summary of the user's progress based on this execution:
  Intent: ${parseResult.intent.raw_input}
  Result: ${executionResult.summary || "In progress"}
  Status: ${executionResult.state.status}`;

        const sessionSummaryResponse = await generateText({
          modelType: "summarization",
          prompt: sessionSummaryPrompt,
          systemPrompt: "You are a concise progress tracker. Summarize in exactly one sentence."
        });

        const memory = getMemoryClient();
        await memory.store({
          type: "user_context",
          namespace: executionId,
          data: { summary: sessionSummaryResponse.content },
          version: 1,
        });
      } catch (summaryError) {
        console.error("Failed to generate session summary:", summaryError);
      }

      // Finalize trace
      const traceResult = tracer.finalize();

      return {
        success: executionResult.success,
        execution_id: executionId,
        status: executionResult.state.status,
        intent: parseResult.intent,
        plan,
        execution_result: executionResult,
        error: executionResult.error,
        trace: traceResult.trace,
        metadata: {
          duration_ms: Math.round(performance.now() - startTime),
          total_tokens: traceResult.totalTokenUsage.totalTokens,
          step_count: plan.steps.length,
          trace_id: executionId,
          total_ms: Math.round(performance.now() - startTime),
        },
      };
    } else {
      // No plan to execute (planning skipped or no plan generated)
      const traceResult = tracer.finalize();

      return {
        success: true,
        execution_id: executionId,
        status: "PLANNED",
        intent: parseResult.intent,
        plan,
        trace: traceResult.trace,
        metadata: {
          duration_ms: Math.round(performance.now() - startTime),
          total_tokens: traceResult.totalTokenUsage.totalTokens,
          trace_id: executionId,
          total_ms: Math.round(performance.now() - startTime),
        },
      };
    }
  } catch (error) {
    // Handle orchestration errors
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const errorCode =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "ORCHESTRATION_ERROR";

    tracer.addErrorEntry("system", errorCode, errorMessage);
    const traceResult = tracer.finalize();

    return {
      success: false,
      execution_id: executionId,
      status: "FAILED",
      error: {
        code: errorCode,
        message: errorMessage,
      },
      trace: traceResult.trace,
      metadata: {
        duration_ms: Math.round(performance.now() - startTime),
        total_tokens: traceResult.totalTokenUsage.totalTokens,
        trace_id: executionId,
        total_ms: Math.round(performance.now() - startTime),
      },
    };
  }
}

// ============================================================================
// GET EXECUTION STATUS
// Retrieve execution status and trace
// ============================================================================

async function getExecutionStatus(
  executionId: string
): Promise<{
  success: boolean;
  state?: ExecutionState;
  trace?: ExecutionTrace;
  error?: { code: string; message: string };
}> {
  try {
    const state = await loadExecutionState(executionId);

    if (!state) {
      return {
        success: false,
        error: {
          code: "EXECUTION_NOT_FOUND",
          message: `Execution ${executionId} not found`,
        },
      };
    }

    return {
      success: true,
      state,
    };
  } catch (error) {
    return {
      success: false,
      error: {
        code: "LOAD_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

// ============================================================================
// API ROUTE HANDLERS
// ============================================================================

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestStartTime = performance.now();

  try {
    // Parse and validate request body
    const body = await request.json();
    const validation = ExecuteRequestSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: `Invalid request: ${validation.error.message}`,
          },
        },
        { status: 400 }
      );
    }

    const { input, context, options } = validation.data;

    // Execute orchestration
    const result = await orchestrateExecution(input, context, options);

    // Build response
    const response = ExecuteResponseSchema.parse({
      success: result.success,
      execution_id: result.execution_id,
      status: result.status,
      intent: result.intent,
      plan: result.plan,
      result: result.execution_result,
      error: result.error,
      trace: result.trace,
      metadata: result.metadata,
    });

    const requestDuration = Math.round(performance.now() - requestStartTime);
    console.log(
      `[Execute] ${result.execution_id} completed in ${requestDuration}ms with status ${result.status}`
    );

    return NextResponse.json(response, {
      status: result.success ? 200 : 400,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    console.error("[Execute] Unhandled error:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: errorMessage,
        },
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const executionId = searchParams.get("execution_id");

    if (!executionId) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "MISSING_PARAMETER",
            message: "execution_id query parameter is required",
          },
        },
        { status: 400 }
      );
    }

    const result = await getExecutionStatus(executionId);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      execution_id: executionId,
      status: result.state?.status,
      state: result.state,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: errorMessage,
        },
      },
      { status: 500 }
    );
  }
}
