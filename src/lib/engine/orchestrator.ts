/**
 * IntentionEngine - Execution Orchestrator
 * Phase 6: Execute plans with dependency resolution and state management
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
import { saveExecutionState, getMemoryClient } from "./memory";
import { MCPClient } from "../../infrastructure/mcp/MCPClient";
import { validateOutputAgainstConstraints } from "./intent";

// ============================================================================
// SCORE OUTCOME
// Mark plan as OPTIMAL if all steps succeeded
// ============================================================================

async function scoreOutcome(plan: Plan, state: ExecutionState): Promise<void> {
  const allSuccessful = state.step_states.every((s) => s.status === "completed");
  if (allSuccessful && plan.id) {
    const memory = getMemoryClient();
    await memory.store({
      type: "system_config",
      namespace: plan.id,
      data: { score: "OPTIMAL", timestamp: new Date().toISOString() },
      version: 1,
    });
  }
}
import { getRegistryManager, RegistryManager } from "./registry";
import { Tracer } from "./tracing";
import { getToolRegistry } from "./tools/registry";
import { generateText, SUMMARIZATION_PROMPT } from "./llm";

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
  summary?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    cost_usd: number;
  };
  error?: {
    code: string;
    message: string;
    step_id?: string;
    logs?: any;
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
  if (step.dependencies.length === 0) {
    return true;
  }

  for (const depId of step.dependencies) {
    const depState = getStepState(state, depId);
    if (!depState || depState.status !== "completed") {
      return false;
    }
  }

  return true;
}

// ============================================================================
// FIND ALL READY STEPS
// Find all pending steps whose dependencies are all completed
// ============================================================================

function findReadySteps(
  plan: Plan,
  state: ExecutionState
): PlanStep[] {
  const pendingSteps = getPendingSteps(state);
  const readySteps: PlanStep[] = [];

  for (const pendingStep of pendingSteps) {
    const planStep = plan.steps.find((s) => s.id === pendingStep.step_id);
    if (planStep && isStepReady(planStep, state)) {
      readySteps.push(planStep);
    }
  }

  return readySteps;
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
      const ref = value.substring(1);
      const [stepId, ...fieldPath] = ref.split(".");

      const depState = getStepState(state, stepId);
      if (depState && depState.output) {
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
        resolved[key] = value;
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

  return await Tracer.startActiveSpan(`execute_step:${step.tool_name}`, async (span) => {
    const toolDef = getToolRegistry().getDefinition(step.tool_name);
    span.setAttributes({
      intent_id: state.intent?.id || "unknown",
      step_type: step.tool_name,
      mcp_server_origin: toolDef?.origin || "local",
    });

    try {
      let stepState = updateStepState(state, step.id, {
        status: "in_progress",
        started_at: timestamp,
        attempts: (getStepState(state, step.id)?.attempts || 0) + 1,
      });

      const resolvedParameters = resolveStepParameters(step, stepState);

      // Task 2: Fix Input Mapping - Dynamic Parameter Bridge
      if (toolDef?.parameter_aliases) {
        for (const [alias, primary] of Object.entries(toolDef.parameter_aliases)) {
          if (resolvedParameters[alias] !== undefined && resolvedParameters[primary] === undefined) {
            resolvedParameters[primary] = resolvedParameters[alias];
          }
        }
      }

      // Task 4: Dynamic Personalization - Use user_preferences for contact_name
      const userPrefs = (state.context?.user_preferences as Record<string, any>) || {};
      if (!resolvedParameters.contact_name || resolvedParameters.contact_name === "User") {
        resolvedParameters.contact_name = userPrefs.display_name || userPrefs.contact_info?.name || "User";
      }

      // Task 3: Semantic Guardrail Layer - Verify parameters match qualitative constraints
      const isActionStep = step.tool_name.toLowerCase().includes("book") || 
                           step.tool_name.toLowerCase().includes("reserve") || 
                           step.tool_name.toLowerCase().includes("schedule");
      
      if (isActionStep && state.intent?.parameters) {
        // Extract qualitative constraints from intent (e.g., "romantic", "cheap")
        const qualitativeConstraints: string[] = [];
        const params = state.intent.parameters;
        if (params.atmosphere) qualitativeConstraints.push(String(params.atmosphere));
        if (params.cuisine) qualitativeConstraints.push(String(params.cuisine));
        if (params.price_range) qualitativeConstraints.push(String(params.price_range));
        if (Array.isArray(params.constraints)) qualitativeConstraints.push(...params.constraints.map(String));

        if (qualitativeConstraints.length > 0) {
          const validation = await validateOutputAgainstConstraints(resolvedParameters, qualitativeConstraints);
          if (!validation.valid) {
            return {
              step_id: step.id,
              status: "awaiting_confirmation",
              input: resolvedParameters,
              error: {
                code: "GUARDRAIL_VIOLATION",
                message: `Constraint mismatch: ${validation.reason || "The selected option may not match your preferences."}`,
              },
              attempts: (getStepState(state, step.id)?.attempts || 0) + 1,
            };
          }
        }
      }

      stepState = updateStepState(stepState, step.id, {
        input: resolvedParameters,
      });

      // Task 1: Enforce Confirmation Guardrails
      if (step.requires_confirmation || toolDef?.requires_confirmation) {
        // If we're here, we need to pause and wait for confirmation
        // In a real system, this would involve updating the state to AWAITING_CONFIRMATION
        // and returning so the caller can handle the UI interaction.
        return {
          step_id: step.id,
          status: "awaiting_confirmation",
          input: resolvedParameters,
          attempts: (getStepState(state, step.id)?.attempts || 0) + 1,
        };
      }

      const toolResult = await toolExecutor.execute(
        step.tool_name,
        resolvedParameters,
        step.timeout_ms
      );

      const stepEndTime = performance.now();
      const latencyMs = Math.round(stepEndTime - stepStartTime);

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

      if (toolResult.success) {
        // Operational Readiness: Store driver details in session memory for follow-up questions
        if (step.tool_name === "dispatch_intent") {
          try {
            const memory = getMemoryClient();
            const output = toolResult.output as any;
            // Assuming output contains message or we can derive info from input + result
            await memory.store({
              type: "user_context",
              namespace: state.execution_id,
              data: {
                last_delivery: {
                  order_id: resolvedParameters.order_id,
                  status: "dispatched",
                  details: output.text || output,
                  timestamp: new Date().toISOString()
                }
              },
              version: 1
            });
          } catch (memError) {
            console.error("[Orchestrator] Failed to store delivery context:", memError);
          }
        }

        return {
          step_id: step.id,
          status: "completed",
          output: toolResult.output,
          completed_at: new Date().toISOString(),
          latency_ms: latencyMs,
          attempts: (getStepState(state, step.id)?.attempts || 0) + 1,
        };
      } else {
        const isValidationError = toolResult.error?.toLowerCase().includes("invalid parameters");
        return {
          step_id: step.id,
          status: "failed",
          error: {
            code: isValidationError ? "TOOL_VALIDATION_FAILED" : "TOOL_EXECUTION_FAILED",
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
  });
}

// ============================================================================
// SUMMARIZE RESULTS
// Generate a concise summary of all tool execution results
// ============================================================================

async function summarizeResults(
  plan: Plan,
  state: ExecutionState
): Promise<string> {
  const completedSteps = getCompletedSteps(state);
  
  if (completedSteps.length === 0) {
    return "No steps were completed successfully.";
  }

  const history = state.step_states.map(s => ({
    step_id: s.step_id,
    tool: plan.steps.find(ps => ps.id === s.step_id)?.tool_name,
    input: s.input,
    output: s.output,
    status: s.status,
    error: s.error
  }));

  const prompt = SUMMARIZATION_PROMPT
    .replace("{intent}", JSON.stringify(state.intent?.parameters || {}))
    .replace("{plan_summary}", plan.summary)
    .replace("{tool_outputs}", JSON.stringify(history, null, 2));

  try {
    const summaryResponse = await generateText({
      modelType: "summarization",
      prompt,
      systemPrompt: "You are a results summarization system. Strictly map outputs to inputs and avoid hallucination."
    });

    return summaryResponse.content;
  } catch (error) {
    console.error("Summarization failed:", error);
    return `Execution completed with ${completedSteps.length} successful steps.`;
  }
}

// ============================================================================
// EXECUTE PLAN
// Main execution entry point with parallel execution and reflection
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

  let state = options.initialState || createInitialState(executionId);
  state = applyStateUpdate(state, { plan, status: "PLANNED" });

  try {
    state = transitionState(state, "EXECUTING");
  } catch (error) {
    throw EngineErrorSchema.parse({
      code: "STATE_TRANSITION_INVALID",
      message: error instanceof Error ? error.message : "Failed to transition to EXECUTING",
      recoverable: false,
      timestamp: new Date().toISOString(),
    });
  }

  state = applyStateUpdate(state, { status: "EXECUTING" });

  for (const step of plan.steps) {
    if (!getStepState(state, step.id)) {
      state = updateStepState(state, step.id, {
        status: "pending",
      });
    }
  }

  if (options.persistState !== false) {
    await saveExecutionState(state);
  }

  try {
    while (true) {
      const readySteps = findReadySteps(plan, state);

      if (readySteps.length === 0) {
        const completedCount = getCompletedSteps(state).length;
        const failedCount = state.step_states.filter(
          (s) => s.status === "failed"
        ).length;
        const totalCount = plan.steps.length;

        if (completedCount + failedCount === totalCount) {
          break;
        } else {
          throw EngineErrorSchema.parse({
            code: "PLAN_CIRCULAR_DEPENDENCY",
            message: "Execution deadlock detected: pending steps exist but none are ready to execute",
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

      // Execute ready steps in parallel
      const stepResultsSettled = await Promise.allSettled(
        readySteps.map((step) =>
          executeStep({
            state,
            step,
            toolExecutor,
            traceCallback: options.traceCallback,
          })
        )
      );

      let anyFailed = false;
      let anyAwaitingConfirmation = false;
      let failedStepResult: StepExecutionState | undefined;
      let failedStep: PlanStep | undefined;

      for (let i = 0; i < stepResultsSettled.length; i++) {
        const settledResult = stepResultsSettled[i];
        const step = readySteps[i];
        
        if (settledResult.status === "fulfilled") {
          const result = settledResult.value;
          state = updateStepState(state, step.id, result);
          if (result.status === "failed") {
            // Task 4: Automatic Plan Repair - Mini-Plan-Refinement for validation errors
            if (result.error?.code === "TOOL_VALIDATION_FAILED" && (result.attempts || 0) < 3) {
              console.log(`[Plan Repair] Attempting mini-refinement for step ${step.tool_name} (attempt ${result.attempts})`);
              
              const repairPrompt = `The execution of step "${step.description}" failed due to a parameter validation error:
Error: ${result.error.message}
Current Parameters: ${JSON.stringify(result.input)}

Please regenerate the parameters for this step to fix the validation error. 
Respond with ONLY a JSON object containing the corrected parameters.`;

              try {
                const repairResponse = await generateText({
                  modelType: "planning",
                  prompt: repairPrompt,
                  systemPrompt: "You are a plan repair assistant. Fix parameter validation errors by following the schema requirements."
                });

                const correctedParams = JSON.parse(repairResponse.content.trim());
                console.log(`[Plan Repair] Regenerated parameters for ${step.tool_name}:`, correctedParams);

                // Update the plan step with corrected parameters for the next attempt
                const stepIndex = plan.steps.findIndex(s => s.id === step.id);
                if (stepIndex !== -1) {
                  plan.steps[stepIndex].parameters = correctedParams;
                  // Reset step state so it can be retried in the next loop iteration
                  state = updateStepState(state, step.id, {
                    status: "pending",
                    attempts: result.attempts,
                  });
                  continue; // Skip the standard failure handling for this step
                }
              } catch (repairError) {
                console.error("[Plan Repair] Mini-refinement failed:", repairError);
              }
            }
            
            anyFailed = true;
            failedStepResult = result;
            failedStep = step;
          } else if (result.status === "awaiting_confirmation") {
            anyAwaitingConfirmation = true;
          }
        } else {
          anyFailed = true;
          const errorResult: StepExecutionState = {
            step_id: step.id,
            status: "failed",
            error: {
              code: "UNKNOWN_ERROR",
              message: String(settledResult.reason),
            },
            completed_at: new Date().toISOString(),
            attempts: (getStepState(state, step.id)?.attempts || 0) + 1,
          };
          state = updateStepState(state, step.id, errorResult);
          failedStepResult = errorResult;
          failedStep = step;
        }
      }

      if (options.persistState !== false) {
        await saveExecutionState(state);
      }

      if (anyAwaitingConfirmation && !anyFailed) {
        state = applyStateUpdate(state, { status: "AWAITING_CONFIRMATION" });
        if (options.persistState !== false) {
          await saveExecutionState(state);
        }
        const endTime = performance.now();
        return {
          state,
          success: false,
          completed_steps: getCompletedSteps(state).length,
          failed_steps: 0,
          total_steps: plan.steps.length,
          execution_time_ms: Math.round(endTime - startTime),
        };
      }

      if (anyFailed && failedStepResult && failedStep) {
        // Reflection Logic
        state = applyStateUpdate(state, { status: "REFLECTING" });
        if (options.persistState !== false) {
          await saveExecutionState(state);
        }

        try {
          const history = state.step_states.map(s => ({
            step_id: s.step_id,
            tool: plan.steps.find(ps => ps.id === s.step_id)?.tool_name,
            status: s.status,
            output: s.output,
            error: s.error
          }));

          const prompt = `Analyze this failure and modify the remaining PLANNED steps to bypass the issue.
Current Plan Steps: ${JSON.stringify(plan.steps)}
Execution History: ${JSON.stringify(history)}
Failed Step: ${failedStep.tool_name}
Error: ${failedStepResult.error?.message}

Respond with only the updated steps for the remaining plan, ensuring dependencies are correct.`;

          const reflectionResponse = await generateText({
            modelType: "planning",
            prompt,
            systemPrompt: "You are a resilient execution engine. Your goal is to modify the plan to bypass failures."
          });

          // In a real implementation, we would parse this into PlanStep[]
          // For now, we'll log it and transition to FAILED as a fallback if parsing fails,
          // but we'll try to implement the state transition to REFLECTING as requested.
          
          console.log("Reflection response:", reflectionResponse.content);
          
          // Transition back to EXECUTING or FAILED based on reflection
          // For this implementation, we will treat reflection as a manual intervention point
          // or a sophisticated retry. Since we don't have a full replanner here, 
          // we'll fail if we can't automatically resolve.
          
          // Reverting to FAILED if no automatic replanning is implemented
          const endTime = performance.now();
          state = applyStateUpdate(state, {
            status: "FAILED",
            error: failedStepResult.error,
            completed_at: new Date().toISOString(),
          });

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
            usage: {
              prompt_tokens: state.token_usage.prompt_tokens,
              completion_tokens: state.token_usage.completion_tokens,
              total_tokens: state.token_usage.total_tokens,
              cost_usd: state.token_usage.total_tokens * 0.0000001,
            },
            error: failedStepResult.error
              ? {
                  code: failedStepResult.error.code,
                  message: failedStepResult.error.message,
                  step_id: failedStep.id,
                }
              : undefined,
          };
        } catch (reflectError) {
          console.error("Reflection failed:", reflectError);
        }
      }
    }

    const endTime = performance.now();
    state = applyStateUpdate(state, {
      status: "COMPLETED",
      completed_at: new Date().toISOString(),
    });

    if (options.persistState !== false) {
      await saveExecutionState(state);
    }

    // Generate final summary
    const summary = await summarizeResults(plan, state);

    // Score the outcome
    await scoreOutcome(plan, state);

    return {
      state,
      success: true,
      completed_steps: plan.steps.length,
      failed_steps: 0,
      total_steps: plan.steps.length,
      execution_time_ms: Math.round(endTime - startTime),
      summary,
      usage: {
        prompt_tokens: state.token_usage.prompt_tokens,
        completion_tokens: state.token_usage.completion_tokens,
        total_tokens: state.token_usage.total_tokens,
        cost_usd: state.token_usage.total_tokens * 0.0000001,
      },
    };
  } catch (error) {
    const endTime = performance.now();
    const errorMessage = error instanceof Error ? error.message : String(error);

    state = applyStateUpdate(state, {
      status: "FAILED",
      error: {
        code: "UNKNOWN_ERROR",
        message: errorMessage,
      },
      completed_at: new Date().toISOString(),
    });

    if (options.persistState !== false) {
      await saveExecutionState(state);
    }

    return {
      state,
      success: false,
      completed_steps: getCompletedSteps(state).length,
      failed_steps: state.step_states.filter((s) => s.status === "failed").length,
      total_steps: plan.steps.length,
      execution_time_ms: Math.round(endTime - startTime),
      usage: {
        prompt_tokens: state.token_usage.prompt_tokens,
        completion_tokens: state.token_usage.completion_tokens,
        total_tokens: state.token_usage.total_tokens,
        cost_usd: state.token_usage.total_tokens * 0.0000001,
      },
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

  if (
    state.status === "COMPLETED" ||
    state.status === "FAILED" ||
    state.status === "CANCELLED"
  ) {
    return {
      state,
      success: state.status === "COMPLETED",
      completed_steps: getCompletedSteps(state).length,
      failed_steps: state.step_states.filter((s) => s.status === "failed").length,
      total_steps: state.plan.steps.length,
      execution_time_ms: state.latency_ms,
    };
  }

  return executePlan(state.plan, toolExecutor, {
    executionId: state.execution_id,
    initialState: state,
    traceCallback: options.traceCallback,
    persistState: options.persistState,
  });
}

// ============================================================================
// EXECUTION ORCHESTRATOR CLASS
// ============================================================================

export class ExecutionOrchestrator {
  private toolExecutor: ToolExecutor;
  private traceCallback?: (entry: TraceEntry) => void;
  private vMcpClient?: MCPClient;
  private registryManager: RegistryManager;

  constructor(
    toolExecutor: ToolExecutor,
    options: { traceCallback?: (entry: TraceEntry) => void } = {}
  ) {
    this.toolExecutor = toolExecutor;
    this.traceCallback = options.traceCallback;
    this.registryManager = getRegistryManager();
    
    if (process.env.VERCEL_MCP_URL) {
      this.vMcpClient = new MCPClient(process.env.VERCEL_MCP_URL);
    }
  }

  /**
   * Initializes the orchestrator by discovering remote tools.
   */
  async initialize(): Promise<void> {
    await this.registryManager.discoverRemoteTools();
  }

  async execute(plan: Plan, executionId?: string): Promise<ExecutionResult> {
    try {
      return await executePlan(plan, this.toolExecutor, {
        executionId,
        traceCallback: this.traceCallback,
      });
    } catch (error: any) {
      if (error && error.code === "INFRASTRUCTURE_ERROR" && this.vMcpClient) {
        try {
          await this.vMcpClient.connect();
          const logs = await Promise.race([
            this.vMcpClient.callTool("get-logs", { 
              deploymentId: process.env.VERCEL_DEPLOYMENT_ID || "current" 
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error("MCP log fetch timeout")), 10000)
            )
          ]);
          
          await this.vMcpClient.disconnect();
          
          return {
            state: error.state || {} as any,
            success: false,
            completed_steps: 0,
            failed_steps: 1,
            total_steps: plan.steps.length,
            execution_time_ms: 0,
            error: {
              code: "INFRASTRUCTURE_ERROR",
              message: error.message,
              logs
            }
          };
        } catch (logError) {
          console.error("Failed to fetch Vercel logs via MCP:", logError);
        }
      }
      throw error;
    }
  }

  async resume(state: ExecutionState): Promise<ExecutionResult> {
    return resumeExecution(state, this.toolExecutor, {
      traceCallback: this.traceCallback,
    });
  }
}
