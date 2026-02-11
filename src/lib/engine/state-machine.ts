/**
 * IntentionEngine - State Machine
 * Phase 5: Explicit state transitions with validation
 * 
 * Constraints:
 * - Explicit transitions only
 * - Transition validation
 * - Reject invalid transitions
 * - No business logic, only state management
 */

import {
  ExecutionState,
  ExecutionStateSchema,
  ExecutionStatus,
  ExecutionStatusSchema,
  ValidStateTransitions,
  isTerminalStatus,
  StepExecutionState,
  StepExecutionStateSchema,
} from "./types";

// ============================================================================
// STATE TRANSITION RESULT
// Result of a state transition attempt
// ============================================================================

export interface StateTransitionResult {
  success: boolean;
  previous_state?: ExecutionStatus;
  new_state?: ExecutionStatus;
  error?: string;
  timestamp: string;
}

// ============================================================================
// CREATE INITIAL STATE
// Factory function for new execution states
// ============================================================================

export function createInitialState(executionId: string): ExecutionState {
  const timestamp = new Date().toISOString();
  
  return ExecutionStateSchema.parse({
    execution_id: executionId,
    status: "RECEIVED",
    step_states: [],
    current_step_index: 0,
    context: {},
    created_at: timestamp,
    updated_at: timestamp,
    token_usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
    latency_ms: 0,
  });
}

// ============================================================================
// VALIDATE STATE TRANSITION
// Check if a transition is valid
// ============================================================================

export function validateStateTransition(
  from: ExecutionStatus,
  to: ExecutionStatus
): { valid: boolean; reason?: string } {
  // Validate statuses are valid
  const fromValidation = ExecutionStatusSchema.safeParse(from);
  const toValidation = ExecutionStatusSchema.safeParse(to);

  if (!fromValidation.success) {
    return { valid: false, reason: `Invalid 'from' state: ${from}` };
  }

  if (!toValidation.success) {
    return { valid: false, reason: `Invalid 'to' state: ${to}` };
  }

  // Check if from state is terminal
  if (isTerminalStatus(from)) {
    return {
      valid: false,
      reason: `Cannot transition from terminal state '${from}'`,
    };
  }

  // Check if transition is allowed
  const allowedTransitions = ValidStateTransitions[from];
  if (!allowedTransitions.includes(to)) {
    return {
      valid: false,
      reason: `Invalid transition from '${from}' to '${to}'. Allowed transitions: ${allowedTransitions.join(", ")}`,
    };
  }

  return { valid: true };
}

// ============================================================================
// TRANSITION STATE
// Attempt to transition execution to a new state
// ============================================================================

export function transitionState(
  state: ExecutionState,
  newStatus: ExecutionStatus
): StateTransitionResult {
  const timestamp = new Date().toISOString();
  const currentStatus = state.status;

  // Validate the transition
  const validation = validateStateTransition(currentStatus, newStatus);
  
  if (!validation.valid) {
    return {
      success: false,
      previous_state: currentStatus,
      error: validation.reason,
      timestamp,
    };
  }

  // Create new state with updated status
  const updatedState: ExecutionState = {
    ...state,
    status: newStatus,
    updated_at: timestamp,
  };

  // If transitioning to terminal state, set completed_at
  if (isTerminalStatus(newStatus)) {
    updatedState.completed_at = timestamp;
  }

  // Validate the updated state
  try {
    ExecutionStateSchema.parse(updatedState);
  } catch (error) {
    return {
      success: false,
      previous_state: currentStatus,
      error: `State validation failed: ${error}`,
      timestamp,
    };
  }

  return {
    success: true,
    previous_state: currentStatus,
    new_state: newStatus,
    timestamp,
  };
}

// ============================================================================
// APPLY STATE UPDATE
// Immutable state update with validation
// ============================================================================

export function applyStateUpdate(
  state: ExecutionState,
  updates: Partial<Omit<ExecutionState, "execution_id" | "created_at">>
): ExecutionState {
  const timestamp = new Date().toISOString();

  // Merge updates
  const updatedState: ExecutionState = {
    ...state,
    ...updates,
    updated_at: timestamp,
  };

  // Validate the complete state
  return ExecutionStateSchema.parse(updatedState);
}

// ============================================================================
// UPDATE STEP STATE
// Update the state of a specific step
// ============================================================================

export function updateStepState(
  state: ExecutionState,
  stepId: string,
  stepUpdates: Partial<StepExecutionState>
): ExecutionState {
  // Find the step state
  const stepIndex = state.step_states.findIndex(s => s.step_id === stepId);
  
  let updatedStepStates: StepExecutionState[];
  
  if (stepIndex === -1) {
    // Step doesn't exist, create it
    const newStepState = StepExecutionStateSchema.parse({
      step_id: stepId,
      status: "pending",
      ...stepUpdates,
    });
    updatedStepStates = [...state.step_states, newStepState];
  } else {
    // Update existing step
    updatedStepStates = state.step_states.map((step, index) => {
      if (index === stepIndex) {
        return StepExecutionStateSchema.parse({
          ...step,
          ...stepUpdates,
        });
      }
      return step;
    });
  }

  // Update the state
  return applyStateUpdate(state, {
    step_states: updatedStepStates,
  });
}

// ============================================================================
// SET INTENT
// Associate an intent with the execution state
// ============================================================================

export function setIntent(
  state: ExecutionState,
  intent: ExecutionState["intent"]
): ExecutionState {
  return applyStateUpdate(state, { intent });
}

// ============================================================================
// SET PLAN
// Associate a plan with the execution state
// ============================================================================

export function setPlan(
  state: ExecutionState,
  plan: ExecutionState["plan"]
): ExecutionState {
  return applyStateUpdate(state, { plan });
}

// ============================================================================
// ADD TOKEN USAGE
// Accumulate token usage across the execution
// ============================================================================

export function addTokenUsage(
  state: ExecutionState,
  promptTokens: number,
  completionTokens: number
): ExecutionState {
  const current = state.token_usage;
  
  return applyStateUpdate(state, {
    token_usage: {
      prompt_tokens: current.prompt_tokens + promptTokens,
      completion_tokens: current.completion_tokens + completionTokens,
      total_tokens: current.total_tokens + promptTokens + completionTokens,
    },
  });
}

// ============================================================================
// SET ERROR
// Set execution error and transition to FAILED state
// ============================================================================

export function setExecutionError(
  state: ExecutionState,
  errorCode: string,
  errorMessage: string,
  stepId?: string,
  details?: unknown
): ExecutionState {
  const timestamp = new Date().toISOString();

  // First transition to FAILED state
  const transitionResult = transitionState(state, "FAILED");
  
  if (!transitionResult.success) {
    throw new Error(`Cannot set error: ${transitionResult.error}`);
  }

  // Apply error to state
  return applyStateUpdate(state, {
    status: "FAILED",
    error: {
      code: errorCode,
      message: errorMessage,
      step_id: stepId,
      details,
    },
    completed_at: timestamp,
  });
}

// ============================================================================
// GET STEP STATE
// Retrieve state of a specific step
// ============================================================================

export function getStepState(
  state: ExecutionState,
  stepId: string
): StepExecutionState | undefined {
  return state.step_states.find(s => s.step_id === stepId);
}

// ============================================================================
// GET COMPLETED STEPS
// Get all completed steps
// ============================================================================

export function getCompletedSteps(state: ExecutionState): StepExecutionState[] {
  return state.step_states.filter(s => s.status === "completed");
}

// ============================================================================
// GET PENDING STEPS
// Get all pending steps
// ============================================================================

export function getPendingSteps(state: ExecutionState): StepExecutionState[] {
  return state.step_states.filter(s => s.status === "pending");
}

// ============================================================================
// GET FAILED STEPS
// Get all failed steps
// ============================================================================

export function getFailedSteps(state: ExecutionState): StepExecutionState[] {
  return state.step_states.filter(s => s.status === "failed");
}

// ============================================================================
// CHECK IF ALL STEPS COMPLETE
// Check if execution is finished
// ============================================================================

export function areAllStepsComplete(state: ExecutionState): boolean {
  if (!state.plan || state.step_states.length === 0) {
    return false;
  }

  const completed = getCompletedSteps(state).length;
  const failed = getFailedSteps(state).length;
  const total = state.plan.steps.length;

  // All steps are either completed or failed
  return completed + failed === total;
}

// ============================================================================
// STATE MACHINE CLASS
// Object-oriented wrapper for state operations
// ============================================================================

export class ExecutionStateMachine {
  private state: ExecutionState;

  constructor(executionId: string) {
    this.state = createInitialState(executionId);
  }

  getState(): ExecutionState {
    return this.state;
  }

  getStatus(): ExecutionStatus {
    return this.state.status;
  }

  transition(newStatus: ExecutionStatus): StateTransitionResult {
    const result = transitionState(this.state, newStatus);
    
    if (result.success && result.new_state) {
      // Re-fetch state with updated status
      this.state = applyStateUpdate(this.state, { status: result.new_state });
    }
    
    return result;
  }

  setIntent(intent: ExecutionState["intent"]): void {
    this.state = setIntent(this.state, intent);
  }

  setPlan(plan: ExecutionState["plan"]): void {
    this.state = setPlan(this.state, plan);
  }

  updateStep(stepId: string, updates: Partial<StepExecutionState>): void {
    this.state = updateStepState(this.state, stepId, updates);
  }

  addTokenUsage(promptTokens: number, completionTokens: number): void {
    this.state = addTokenUsage(this.state, promptTokens, completionTokens);
  }

  setError(
    errorCode: string,
    errorMessage: string,
    stepId?: string,
    details?: unknown
  ): void {
    this.state = setExecutionError(this.state, errorCode, errorMessage, stepId, details);
  }

  getStepState(stepId: string): StepExecutionState | undefined {
    return getStepState(this.state, stepId);
  }

  isComplete(): boolean {
    return isTerminalStatus(this.state.status);
  }

  canTransitionTo(status: ExecutionStatus): boolean {
    return validateStateTransition(this.state.status, status).valid;
  }
}
