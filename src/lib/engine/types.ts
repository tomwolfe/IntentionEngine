/**
 * IntentionEngine - Core Domain Types and Schemas
 * Phase 1: Type definitions only. Zero business logic.
 */

import { z } from "zod";

// ============================================================================
// EXECUTION STATUS ENUM
// Finite, explicit states for the execution lifecycle
// ============================================================================

export const ExecutionStatusSchema = z.enum([
  "RECEIVED",      // Initial state: execution request received
  "PARSING",       // Parsing user input into structured intent
  "PARSED",        // Intent successfully parsed and validated
  "PLANNING",      // Generating execution plan
  "PLANNED",       // Plan generated and validated
  "EXECUTING",     // Actively executing plan steps
  "REFLECTING",    // Analyzing failure and replanning
  "COMPLETED",     // All steps executed successfully
  "FAILED",        // Execution failed (non-recoverable)
  "REJECTED",      // Plan or intent rejected by validation
  "TIMEOUT",       // Execution exceeded time limits
  "CANCELLED",     // Explicitly cancelled by user or system
]);

export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

// ============================================================================
// INTENT SCHEMA
// Structured representation of user intent
// ============================================================================

export const IntentTypeSchema = z.enum([
  "SCHEDULE",
  "SEARCH",
  "ACTION",
  "QUERY",
  "PLANNING",
  "ANALYSIS",
  "UNKNOWN",
  "CLARIFICATION_REQUIRED",
]);

export type IntentType = z.infer<typeof IntentTypeSchema>;

export const IntentMetadataSchema = z.object({
  version: z.string(),
  timestamp: z.string().datetime(),
  source: z.string().default("user_input"),
  model_id: z.string().optional(),
  execution_id: z.string().uuid().optional(),
});

export type IntentMetadata = z.infer<typeof IntentMetadataSchema>;

export const IntentSchema = z.object({
  id: z.string().uuid(),
  type: IntentTypeSchema,
  confidence: z.number().min(0).max(1),
  parameters: z.record(z.string(), z.unknown()),
  raw_input: z.string(),
  explanation: z.string().optional(),
  metadata: IntentMetadataSchema,
  requires_clarification: z.boolean().default(false),
  clarification_prompt: z.string().optional(),
});

export type Intent = z.infer<typeof IntentSchema>;

// ============================================================================
// PLAN STEP SCHEMA
// Individual step in an execution plan with DAG support
// ============================================================================

export const PlanStepSchema = z.object({
  id: z.string().uuid(),
  step_number: z.number().int().nonnegative(),
  tool_name: z.string(),
  tool_version: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()),
  dependencies: z.array(z.string().uuid()).default([]),
  description: z.string(),
  requires_confirmation: z.boolean().default(false),
  timeout_ms: z.number().int().positive().default(30000),
  estimated_tokens: z.number().int().nonnegative().optional(),
  retry_policy: z.object({
    max_attempts: z.number().int().positive().default(1),
    backoff_ms: z.number().int().nonnegative().default(1000),
  }).optional(),
});

export type PlanStep = z.infer<typeof PlanStepSchema>;

// ============================================================================
// PLAN SCHEMA
// DAG-enforced execution plan
// ============================================================================

export const PlanConstraintsSchema = z.object({
  max_steps: z.number().int().positive().max(100),
  max_total_tokens: z.number().int().positive(),
  max_execution_time_ms: z.number().int().positive(),
  allowed_tools: z.array(z.string()).optional(),
  require_confirmation_for: z.array(z.string()).optional(),
});

export type PlanConstraints = z.infer<typeof PlanConstraintsSchema>;

export const PlanMetadataSchema = z.object({
  version: z.string(),
  created_at: z.string().datetime(),
  planning_model_id: z.string(),
  estimated_total_tokens: z.number().int().nonnegative(),
  estimated_latency_ms: z.number().int().nonnegative(),
});

export type PlanMetadata = z.infer<typeof PlanMetadataSchema>;

export const PlanSchema = z.object({
  id: z.string().uuid(),
  intent_id: z.string().uuid(),
  steps: z.array(PlanStepSchema).max(100),
  constraints: PlanConstraintsSchema,
  metadata: PlanMetadataSchema,
  summary: z.string(),
}).refine(
  (plan) => {
    // DAG Validation: Detect circular dependencies
    const stepIds = new Set(plan.steps.map((s) => s.id));
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    function hasCycle(stepId: string): boolean {
      if (recursionStack.has(stepId)) return true;
      if (visited.has(stepId)) return false;

      visited.add(stepId);
      recursionStack.add(stepId);

      const step = plan.steps.find((s) => s.id === stepId);
      if (step) {
        for (const depId of step.dependencies) {
          if (!stepIds.has(depId)) {
            return true; // Invalid: dependency references non-existent step
          }
          if (hasCycle(depId)) return true;
        }
      }

      recursionStack.delete(stepId);
      return false;
    }

    for (const step of plan.steps) {
      if (hasCycle(step.id)) return false;
    }

    // Validate step numbers are sequential and unique
    const stepNumbers = plan.steps.map((s) => s.step_number).sort((a, b) => a - b);
    for (let i = 0; i < stepNumbers.length; i++) {
      if (stepNumbers[i] !== i) return false;
    }

    // Validate dependencies don't create forward references that violate step_number order
    for (const step of plan.steps) {
      for (const depId of step.dependencies) {
        const depStep = plan.steps.find((s) => s.id === depId);
        if (depStep && depStep.step_number >= step.step_number) {
          return false; // Dependency must have lower step_number
        }
      }
    }

    return true;
  },
  {
    message: "Plan must be a valid DAG: no circular dependencies, all dependencies must reference existing steps with lower step numbers",
  }
);

export type Plan = z.infer<typeof PlanSchema>;

// ============================================================================
// TOOL DEFINITION INTERFACE
// Schema for tool registration and validation
// ============================================================================

export const ToolParameterSchema = z.object({
  name: z.string(),
  type: z.enum(["string", "number", "boolean", "object", "array"]),
  description: z.string(),
  required: z.boolean().default(false),
  default_value: z.unknown().optional(),
  validation_regex: z.string().optional(),
  enum_values: z.array(z.string()).optional(),
});

export type ToolParameter = z.infer<typeof ToolParameterSchema>;

export const ToolDefinitionSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  inputSchema: z.object({
    type: z.literal("object"),
    properties: z.record(z.string(), z.any()),
    required: z.array(z.string()).optional(),
  }),
  return_schema: z.record(z.string(), z.unknown()),
  timeout_ms: z.number().int().positive().default(30000),
  requires_confirmation: z.boolean().default(false),
  category: z.enum(["data", "action", "communication", "calculation", "external"]),
  origin: z.string().optional(), // Added for observability (e.g., MCP server URL)
  rate_limits: z.object({
    requests_per_minute: z.number().int().positive().optional(),
    requests_per_hour: z.number().int().positive().optional(),
  }).optional(),
});

export type ToolDefinition = z.infer<typeof ToolDefinitionSchema>;

// ============================================================================
// CHECKPOINT SCHEMA
// Durable execution state for MCP-compliant state machine
// ============================================================================

export const CheckpointStatusSchema = z.enum([
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
]);

export type CheckpointStatus = z.infer<typeof CheckpointStatusSchema>;

export const CheckpointHistoryItemSchema = z.object({
  role: z.enum(["user", "assistant", "tool"]),
  content: z.string().optional(),
  tool_call: z.unknown().optional(),
  tool_result: z.unknown().optional(),
  thought: z.string().optional(),
  timestamp: z.string().datetime(),
});

export type CheckpointHistoryItem = z.infer<typeof CheckpointHistoryItemSchema>;

export const CheckpointSchema = z.object({
  intentId: z.string().uuid(),
  cursor: z.number().int().nonnegative(),
  history: z.array(CheckpointHistoryItemSchema),
  status: CheckpointStatusSchema,
  metadata: z.record(z.string(), z.unknown()).default({}),
  updated_at: z.string().datetime(),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;

// ============================================================================
// EXECUTION STATE SCHEMA
// Stateful tracking of execution progress
// ============================================================================

export const StepExecutionStateSchema = z.object({
  step_id: z.string().uuid(),
  status: z.enum(["pending", "in_progress", "completed", "failed", "skipped", "timeout"]),
  input: z.record(z.string(), z.unknown()).optional(),
  output: z.unknown().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }).optional(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  attempts: z.number().int().nonnegative().default(0),
  latency_ms: z.number().int().nonnegative().optional(),
});

export type StepExecutionState = z.infer<typeof StepExecutionStateSchema>;

export const ExecutionStateSchema = z.object({
  execution_id: z.string().uuid(),
  status: ExecutionStatusSchema,
  intent: IntentSchema.optional(),
  plan: PlanSchema.optional(),
  step_states: z.array(StepExecutionStateSchema).default([]),
  current_step_index: z.number().int().nonnegative().default(0),
  context: z.record(z.string(), z.unknown()).default({}),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    step_id: z.string().uuid().optional(),
    details: z.unknown().optional(),
  }).optional(),
  token_usage: z.object({
    prompt_tokens: z.number().int().nonnegative().default(0),
    completion_tokens: z.number().int().nonnegative().default(0),
    total_tokens: z.number().int().nonnegative().default(0),
  }).default({
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  }),
  latency_ms: z.number().int().nonnegative().default(0),
});

export type ExecutionState = z.infer<typeof ExecutionStateSchema>;

// ============================================================================
// STATE TRANSITION VALIDATION
// Explicitly defines valid state transitions
// ============================================================================

export const ValidStateTransitions: Record<ExecutionStatus, ExecutionStatus[]> = {
  RECEIVED: ["PARSING", "CANCELLED", "EXECUTING"],
  PARSING: ["PARSED", "REJECTED", "TIMEOUT", "FAILED"],
  PARSED: ["PLANNING", "CANCELLED"],
  PLANNING: ["PLANNED", "REJECTED", "TIMEOUT", "FAILED"],
  PLANNED: ["EXECUTING", "CANCELLED"],
  EXECUTING: ["COMPLETED", "FAILED", "TIMEOUT", "CANCELLED", "REFLECTING"],
  REFLECTING: ["EXECUTING", "FAILED", "CANCELLED"],
  COMPLETED: [],
  FAILED: [],
  REJECTED: [],
  TIMEOUT: [],
  CANCELLED: [],
};

// ============================================================================
// EXECUTION TRACE SCHEMA
// Observability and audit trail
// ============================================================================

export const TraceEntrySchema = z.object({
  timestamp: z.string().datetime(),
  phase: z.enum(["intent", "planning", "execution", "system"]),
  step_id: z.string().uuid().optional(),
  event: z.string(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  error: z.unknown().optional(),
  latency_ms: z.number().int().nonnegative().optional(),
  model_id: z.string().optional(),
  token_usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }).optional(),
});

export type TraceEntry = z.infer<typeof TraceEntrySchema>;

export const ExecutionTraceSchema = z.object({
  trace_id: z.string().uuid(),
  execution_id: z.string().uuid(),
  entries: z.array(TraceEntrySchema),
  started_at: z.string().datetime(),
  ended_at: z.string().datetime().optional(),
  total_latency_ms: z.number().int().nonnegative().optional(),
  total_token_usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }).optional(),
});

export type ExecutionTrace = z.infer<typeof ExecutionTraceSchema>;

// ============================================================================
// MEMORY ENTRY SCHEMA
// Redis abstraction layer types
// ============================================================================

export const MemoryEntryTypeSchema = z.enum([
  "execution_state",
  "execution_trace",
  "intent_history",
  "plan_cache",
  "tool_result",
  "user_context",
  "system_config",
]);

export type MemoryEntryType = z.infer<typeof MemoryEntryTypeSchema>;

export const MemoryEntrySchema = z.object({
  key: z.string(),
  type: MemoryEntryTypeSchema,
  namespace: z.string(),
  data: z.unknown(),
  created_at: z.string().datetime(),
  expires_at: z.string().datetime().optional(),
  ttl_seconds: z.number().int().nonnegative().optional(),
  version: z.number().int().nonnegative().default(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type MemoryEntry = z.infer<typeof MemoryEntrySchema>;

export const MemoryQuerySchema = z.object({
  namespace: z.string(),
  type: MemoryEntryTypeSchema.optional(),
  prefix: z.string().optional(),
  after: z.string().datetime().optional(),
  before: z.string().datetime().optional(),
  limit: z.number().int().positive().max(1000).default(100),
});

export type MemoryQuery = z.infer<typeof MemoryQuerySchema>;

// ============================================================================
// LLM INTERACTION SCHEMAS
// Request/response types for LLM abstraction
// ============================================================================

export const LLMModelTypeSchema = z.enum([
  "classification",  // For intent parsing
  "planning",        // For plan generation
  "execution",       // For step execution assistance
  "summarization",   // For result summarization
]);

export type LLMModelType = z.infer<typeof LLMModelTypeSchema>;

export const LLMRequestSchema = z.object({
  model_type: LLMModelTypeSchema,
  prompt: z.string(),
  system_prompt: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.1),
  max_tokens: z.number().int().positive().optional(),
  timeout_ms: z.number().int().positive().default(30000),
  schema: z.record(z.string(), z.unknown()).optional(),
});

export type LLMRequest = z.infer<typeof LLMRequestSchema>;

export const LLMResponseSchema = z.object({
  content: z.string(),
  structured_output: z.unknown().optional(),
  model_id: z.string(),
  latency_ms: z.number().int().nonnegative(),
  token_usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }),
  finish_reason: z.enum(["stop", "length", "timeout", "error"]),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }).optional(),
});

export type LLMResponse = z.infer<typeof LLMResponseSchema>;

// ============================================================================
// ERROR SCHEMAS
// Structured error types for deterministic failure handling
// ============================================================================

export const EngineErrorCodeSchema = z.enum([
  "INTENT_PARSE_FAILED",
  "INTENT_VALIDATION_FAILED",
  "PLAN_GENERATION_FAILED",
  "PLAN_VALIDATION_FAILED",
  "PLAN_CIRCULAR_DEPENDENCY",
  "STEP_EXECUTION_FAILED",
  "STEP_TIMEOUT",
  "TOOL_NOT_FOUND",
  "TOOL_EXECUTION_FAILED",
  "TOOL_VALIDATION_FAILED",
  "STATE_TRANSITION_INVALID",
  "MEMORY_OPERATION_FAILED",
  "LLM_REQUEST_FAILED",
  "LLM_SCHEMA_VALIDATION_FAILED",
  "LLM_TIMEOUT",
  "TOKEN_BUDGET_EXCEEDED",
  "MAX_STEPS_EXCEEDED",
  "INFRASTRUCTURE_ERROR",
  "UNKNOWN_ERROR",
]);

export type EngineErrorCode = z.infer<typeof EngineErrorCodeSchema>;

export const EngineErrorSchema = z.object({
  code: EngineErrorCodeSchema,
  message: z.string(),
  execution_id: z.string().uuid().optional(),
  step_id: z.string().uuid().optional(),
  details: z.unknown().optional(),
  recoverable: z.boolean().default(false),
  timestamp: z.string().datetime(),
});

export type EngineError = z.infer<typeof EngineErrorSchema>;

// ============================================================================
// EXPORT TYPE GUARDS
// Type-safe validation helpers
// ============================================================================

export function isValidExecutionStatus(status: string): status is ExecutionStatus {
  return ExecutionStatusSchema.safeParse(status).success;
}

export function isValidStateTransition(
  from: ExecutionStatus,
  to: ExecutionStatus
): boolean {
  return ValidStateTransitions[from].includes(to);
}

export function isTerminalStatus(status: ExecutionStatus): boolean {
  return ["COMPLETED", "FAILED", "REJECTED", "TIMEOUT", "CANCELLED"].includes(status);
}
