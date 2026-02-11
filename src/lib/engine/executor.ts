/**
 * IntentionEngine - Execution Engine
 * Phase 6: Execute plans with dependency resolution and state management
 *
 * Constraints:
 * - No LLM calls outside llm.ts
 * - No direct Redis usage (use state-machine and memory layers)
 * - No dynamic execution
 * - Abort on first failure
 * - Topological execution order
 */

import {
  ExecutionState,
  ExecutionStatus,
  Plan,
  PlanStep,
  StepExecutionState,
  TraceEntry,
  EngineErrorSchema,
  EngineErrorCode,
} from "./types";
import {
  ExecutionStateMachine,
  createInitialState,
  transitionState,
  updateStepState,
  applyStateUpdate,
  getStepState,
  getCompletedSteps,
  getPendingSteps,
} from "./state-machine";
import { saveExecutionState } from "./memory";

// ============================================================================
// EXECUTION RESULT
// Result of execution operation
// ============================================================================

export interface ExecutionResult {
  state: ExecutionState;
  success: boolean;
  completed_steps: number;
  failed_steps: number;
  total_steps: number;
  execution_time_ms: number;
  error?: {
    code: string;
    message: string;
    step_id?: string;
  };
}

// ============================================================================
// TOOL EXECUTOR INTERFACE
// Abstraction for tool execution
// ============================================================================

export interface ToolExecutor {
  execute(
    toolName: string,
    parameters: Record<string, unknown>,
    timeoutMs: number
  ): Promise<{
    success: boolean;
    output?: unknown;
    error?: string;
    latency_ms: number;
  }>;
}

// ============================================================================
// STEP EXECUTION CONTEXT
// Context passed during step execution
// ============================================================================

interface StepExecutionContext {
  state: ExecutionState;
  step: PlanStep;
  toolExecutor: ToolExecutor;
  traceCallback?: (entry: TraceEntry) => void;
}

// ============================================================================
// CHECK STEP READY
// Determine if a step's dependencies are satisfied
// ============================================================================

function isStepReady(step: PlanStep, state: ExecutionState): boolean {
  // No dependencies = ready to execute
  if (step.dependencies.length === 0) {
    return true;
  }

  // Check all dependencies are completed
  for (const depId of step.dependencies) {
    const depState = getStepState(state, depId);
    if (!depState || depState.status !== "completed") {
      return false;
    }
  }

  return true;
}

// ============================================================================
// RESOLVE STEP PARAMETERS
// Substitute parameter references with values from completed steps
// ============================================================================

function resolveStepParameters(
  step: PlanStep,
  state: ExecutionState
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(step.parameters)) {
    if (
      typeof value === "string" &&
      value.startsWith("$") &&
      value.includes(".")
    ) {
      // Parameter reference format: $stepId.outputField
      const ref = value.substring(1); // Remove $
      const [stepId, ...fieldPath] = ref.split(".");

      // Find the dependency step output
      const depState = getStepState(state, stepId);
      if (depState && depState.output) {
        // Navigate the output object
        let fieldValue: unknown = depState.output;
        for (const field of fieldPath) {
          if (
            fieldValue &&
            typeof fieldValue === "object" &&
            field in fieldValue
          ) {
            fieldValue = (fieldValue as Record<string, unknown>)[field];
          } else {
            fieldValue = undefined;
            break;
          }
        }
        resolved[key] = fieldValue ?? value;
      } else {
        resolved[key] = value; // Keep original if not found
      }
    } else {
      resolved[key] = value;
    }
  }

  return resolved;
}

// ============================================================================
// EXECUTE SINGLE STEP
// Execute one step with timeout and error handling
// ============================================================================

async function executeStep(
  context: StepExecutionContext
): Promise<StepExecutionState> {
  const { state, step, toolExecutor, traceCallback } = context;
  const stepStartTime = performance.now();
  const timestamp = new Date().toISOString();

  try {
    // Mark step as in_progress
    let stepState = updateStepState(state, step.id, {
      status: "in_progress",
      started_at: timestamp,
      attempts: (getStepState(state, step.id)?.attempts || 0) + 1,
    });

    // Resolve parameters (substitute references)
    const resolvedParameters = resolveStepParameters(step, stepState);

    // Update step with resolved input
    stepState = updateStepState(stepState, step.id, {
      input: resolvedParameters,
    });

    // Execute the tool with timeout
    const toolResult = await toolExecutor.execute(
      step.tool_name,
      resolvedParameters,
      step.timeout_ms
    );

    const stepEndTime = performance.now();
    const latencyMs = Math.round(stepEndTime - stepStartTime);

    // Create trace entry
    if (traceCallback) {
      traceCallback({
        timestamp,
        phase: "execution",
        step_id: step.id,
        event: toolResult.success ? "step_completed" : "step_failed",
        input: resolvedParameters,
        output: toolResult.success ? toolResult.output : undefined,
        error: toolResult.success ? undefined : toolResult.error,
        latency_ms: latencyMs,
      });
    }

    // Update step state based on result
    if (toolResult.success) {
      return {
        step_id: step.id,
        status: "completed",
        output: toolResult.output,
        completed_at: new Date().toISOString(),
        latency_ms: latencyMs,
        attempts: (getStepState(state, step.id)?.attempts || 0) + 1,
      };
    } else {
      return {
        step_id: step.id,
        status: "failed",
        error: {
          code: "TOOL_EXECUTION_FAILED",
          message: toolResult.error || "Unknown tool execution error",
        },
        completed_at: new Date().toISOString(),
        latency_ms: latencyMs,
        attempts: (getStepState(state, step.id)?.attempts || 0) + 1,
      };
    }
  } catch (error) {
    const stepEndTime = performance.now();
    const latencyMs = Math.round(stepEndTime - stepStartTime);

    const errorMessage =
      error instanceof Error ? error.message : String(error);

    // Create trace entry for error
    if (traceCallback) {
      traceCallback({
        timestamp,
        phase: "execution",
        step_id: step.id,
        event: "step_error",
        error: errorMessage,
        latency_ms: latencyMs,
      });
    }

    return {
      step_id: step.id,
      status: "failed",
      error: {
        code: "STEP_EXECUTION_FAILED",
        message: errorMessage,
      },
      completed_at: new Date().toISOString(),
      latency_ms: latencyMs,
      attempts: (getStepState(state, step.id)?.attempts || 0) + 1,
    };
  }
}

// ============================================================================
// FIND NEXT READY STEP
// Find a pending step whose dependencies are all completed
// ============================================================================

function findNextReadyStep(
  plan: Plan,
  state: ExecutionState
): PlanStep | null {
  const pendingSteps = getPendingSteps(state);

  for (const pendingStep of pendingSteps) {
    const planStep = plan.steps.find((s) => s.id === pendingStep.step_id);
    if (planStep && isStepReady(planStep, state)) {
      return planStep;
    }
  }

  return null;
}

// ============================================================================
// EXECUTE PLAN
// Main execution entry point
// ============================================================================

export async function executePlan(
  plan: Plan,
  toolExecutor: ToolExecutor,
  options: {
    executionId?: string;
    initialState?: ExecutionState;
    traceCallback?: (entry: TraceEntry) => void;
    persistState?: boolean;
  } = {}
): Promise<ExecutionResult> {
  const startTime = performance.now();
  const executionId = options.executionId || crypto.randomUUID();

  // Initialize or use provided state
  let state =
    options.initialState ||
    createInitialState(executionId);

  // Associate plan with state
  state = applyStateUpdate(state, { plan });

  // Transition to EXECUTING
  const transitionResult = transitionState(state, "EXECUTING");
  if (!transitionResult.success) {
    throw EngineErrorSchema.parse({
      code: "STATE_TRANSITION_INVALID",
      message: transitionResult.error || "Failed to transition to EXECUTING",
      recoverable: false,
      timestamp: new Date().toISOString(),
    });
  }

  state = applyStateUpdate(state, { status: "EXECUTING" });

  // Initialize step states
  for (const step of plan.steps) {
    state = updateStepState(state, step.id, {
      status: "pending",
    });
  }

  // Persist initial state
  if (options.persistState !== false) {
    await saveExecutionState(state);
  }

  try {
    // Execute steps in dependency order
    while (true) {
      const nextStep = findNextReadyStep(plan, state);

      if (!nextStep) {
        // No more ready steps - check if we're done
        const completedCount = getCompletedSteps(state).length;
        const failedCount = state.step_states.filter(
          (s) => s.status === "failed"
        ).length;
        const totalCount = plan.steps.length;

        if (completedCount + failedCount === totalCount) {
          // All steps processed
          break;
        } else {
          // Deadlock detected - steps pending but none ready
          throw EngineErrorSchema.parse({
            code: "PLAN_CIRCULAR_DEPENDENCY",
            message:
              "Execution deadlock detected: pending steps exist but none are ready to execute",
            details: {
              completed: completedCount,
              failed: failedCount,
              pending: totalCount - completedCount - failedCount,
            },
            recoverable: false,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Execute the next ready step
      const stepResult = await executeStep({
        state,
        step: nextStep,
        toolExecutor,
        traceCallback: options.traceCallback,
      });

      // Update state with step result
      state = updateStepState(state, nextStep.id, stepResult);

      // Persist state after each step
      if (options.persistState !== false) {
        await saveExecutionState(state);
      }

      // Check for failure - abort on first failure
      if (stepResult.status === "failed") {
        const endTime = performance.now();

        // Transition to FAILED
        state = applyStateUpdate(state, {
          status: "FAILED",
          error: stepResult.error,
          completed_at: new Date().toISOString(),
        });

        // Persist final state
        if (options.persistState !== false) {
          await saveExecutionState(state);
        }

        return {
          state,
          success: false,
          completed_steps: getCompletedSteps(state).length,
          failed_steps: 1,
          total_steps: plan.steps.length,
          execution_time_ms: Math.round(endTime - startTime),
          error: stepResult.error
            ? {
                code: stepResult.error.code,
                message: stepResult.error.message,
                step_id: nextStep.id,
              }
            : undefined,
        };
      }
    }

    // All steps completed successfully
    const endTime = performance.now();

    // Transition to COMPLETED
    state = applyStateUpdate(state, {
      status: "COMPLETED",
      completed_at: new Date().toISOString(),
    });

    // Persist final state
    if (options.persistState !== false) {
      await saveExecutionState(state);
    }

    return {
      state,
      success: true,
      completed_steps: plan.steps.length,
      failed_steps: 0,
      total_steps: plan.steps.length,
      execution_time_ms: Math.round(endTime - startTime),
    };
  } catch (error) {
    const endTime = performance.now();

    // Handle unexpected errors
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    // Transition to FAILED
    state = applyStateUpdate(state, {
      status: "FAILED",
      error: {
        code: "UNKNOWN_ERROR",
        message: errorMessage,
      },
      completed_at: new Date().toISOString(),
    });

    // Persist final state
    if (options.persistState !== false) {
      await saveExecutionState(state);
    }

    return {
      state,
      success: false,
      completed_steps: getCompletedSteps(state).length,
      failed_steps: state.step_states.filter((s) => s.status === "failed")
        .length,
      total_steps: plan.steps.length,
      execution_time_ms: Math.round(endTime - startTime),
      error: {
        code: "UNKNOWN_ERROR",
        message: errorMessage,
      },
    };
  }
}

// ============================================================================
// RESUME EXECUTION
// Resume execution from a persisted state
// ============================================================================

export async function resumeExecution(
  state: ExecutionState,
  toolExecutor: ToolExecutor,
  options: {
    traceCallback?: (entry: TraceEntry) => void;
    persistState?: boolean;
  } = {}
): Promise<ExecutionResult> {
  if (!state.plan) {
    throw EngineErrorSchema.parse({
      code: "PLAN_GENERATION_FAILED",
      message: "Cannot resume execution: no plan associated with state",
      recoverable: false,
      timestamp: new Date().toISOString(),
    });
  }

  // Check if execution is already complete
  if (
    state.status === "COMPLETED" ||
    state.status === "FAILED" ||
    state.status === "CANCELLED"
  ) {
    return {
      state,
      success: state.status === "COMPLETED",
      completed_steps: getCompletedSteps(state).length,
      failed_steps: state.step_states.filter((s) => s.status === "failed")
        .length,
      total_steps: state.plan.steps.length,
      execution_time_ms: state.latency_ms,
    };
  }

  // Resume execution
  return executePlan(state.plan, toolExecutor, {
    executionId: state.execution_id,
    initialState: state,
    traceCallback: options.traceCallback,
    persistState: options.persistState,
  });
}

// ============================================================================
// EXECUTION ENGINE CLASS
// Object-oriented wrapper
// ============================================================================

export class ExecutionEngine {
  private toolExecutor: ToolExecutor;
  private traceCallback?: (entry: TraceEntry) => void;

  constructor(
    toolExecutor: ToolExecutor,
    options: { traceCallback?: (entry: TraceEntry) => void } = {}
  ) {
    this.toolExecutor = toolExecutor;
    this.traceCallback = options.traceCallback;
  }

  async execute(plan: Plan, executionId?: string): Promise<ExecutionResult> {
    return executePlan(plan, this.toolExecutor, {
      executionId,
      traceCallback: this.traceCallback,
    });
  }

  async resume(state: ExecutionState): Promise<ExecutionResult> {
    return resumeExecution(state, this.toolExecutor, {
      traceCallback: this.traceCallback,
    });
  }
}


