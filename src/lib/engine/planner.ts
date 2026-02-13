/**
 * IntentionEngine - Planner
 * Phase 4: Generate validated execution plans from intents
 * 
 * Constraints:
 * - No execution logic
 * - No tool execution
 * - Must reject invalid plans
 * - Must not self-heal silently
 * - Enforces DAG, step count, token budget
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import { getMemoryClient } from "./memory";
import {
  Intent,
  Plan,
  PlanSchema,
  PlanStep,
  PlanStepSchema,
  PlanConstraints,
  PlanConstraintsSchema,
  PlanMetadataSchema,
  ToolDefinition,
  TraceEntry,
  TraceEntrySchema,
  EngineErrorSchema,
  EngineErrorCodeSchema,
} from "./types";
import { generateStructured, GenerateStructuredResult } from "./llm";

// ============================================================================
// DEFAULT CONSTRAINTS
// Maximum limits for plan generation
// ============================================================================

export const DEFAULT_PLAN_CONSTRAINTS: PlanConstraints = {
  max_steps: 10,
  max_total_tokens: 8000,
  max_execution_time_ms: 120000, // 2 minutes
};

// ============================================================================
// RAW PLAN OUTPUT (from LLM)
// Structure expected from the planning model
// ============================================================================

const RawPlanStepSchema = z.object({
  step_number: z.number().int().nonnegative(),
  tool_name: z.string(),
  tool_version: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()),
  dependencies: z.array(z.number().int().nonnegative()).default([]), // References step_number, not UUID
  description: z.string(),
  requires_confirmation: z.boolean().default(false),
  estimated_tokens: z.number().int().nonnegative().optional(),
});

const RawPlanSchema = z.object({
  steps: z.array(RawPlanStepSchema).min(1),
  summary: z.string(),
  estimated_total_tokens: z.number().int().nonnegative(),
  estimated_latency_ms: z.number().int().nonnegative(),
});

export type RawPlanStep = z.infer<typeof RawPlanStepSchema>;
export type RawPlan = z.infer<typeof RawPlanSchema>;

// ============================================================================
// PLANNER CONTEXT
// Context for plan generation
// ============================================================================

export interface PlannerContext {
  execution_id?: string;
  available_tools?: ToolDefinition[];
  constraints?: Partial<PlanConstraints>;
  user_preferences?: Record<string, unknown>;
  repairFeedback?: string;
}

// ============================================================================
// PLANNER RESULT
// Result of plan generation operation
// ============================================================================

export interface PlannerResult {
  plan: Plan;
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
// Instructions for the planning model
// ============================================================================

const PLANNING_PROMPT_TEMPLATE = `You are a planning system that converts user intents into executable step-by-step plans.

## Capability Statement
You are equipped with a suite of real-world tools. If a tool is listed in 'Available Tools', you HAVE the authority to use it. Do not tell the user you cannot perform an action if a corresponding tool is provided.

## Task
Given a user intent, create a detailed execution plan with ordered steps. Each step specifies:
- tool_name: The tool to execute. Use the exact tool names defined in the registry. Precision is mandatory for execution.
- parameters: Required parameters for the tool
- dependencies: Step numbers (0-indexed) that must complete before this step
- description: Human-readable description of what this step does
- requires_confirmation: Whether this step needs user approval

## Rules
1. Steps must be ordered logically (dependencies must have lower step_number)
2. NO circular dependencies allowed
3. Max {max_steps} steps allowed - if task requires more, combine steps
4. FAN-OUT: If an intent parameter contains an array of entities (e.g., location: ["Tokyo", "London"]) and the chosen tool only handles one entity at a time, you MUST generate a separate PlanStep for EACH entity. These steps should execute in parallel (no dependencies between them) unless one logically depends on the other.
5. Strict Matching & Suitability Rule: The agent MUST NOT select a restaurant unless its cuisine tags explicitly match the user's requested style. If "romantic", "high-end", or "fine dining" is specified, you MUST explicitly reject fast-food chains or budget casual spots (e.g., McDonald's, Pizza Hut) even if they match the general cuisine type. If no exact, suitable matches are found, report this to the user rather than selecting a sub-optimal alternative.
6. Estimate token usage for each step (approximate)
7. Provide clear, actionable descriptions
8. Use requires_confirmation for irreversible actions (payments, sends, bookings)
9. SYSTEM 2 REASONING: If you detect both a delivery request (OpenDeliver) and a reservation request (TableStack) for the same location and time, you MUST suggest merging them into a "Dine-in with Special Delivery" intent. In the plan summary, explicitly explain that the items will be delivered directly to the restaurant table for the guest's arrival.

## Available Tools
{available_tools}

## Output Format
Return a JSON object with:
- steps: Array of step objects. For fan-out, ensure multiple steps are generated.
- summary: Brief summary of the overall plan
- estimated_total_tokens: Total token estimate for all steps
- estimated_latency_ms: Estimated execution time in milliseconds

## Example
Input Intent:
{
  "type": "QUERY",
  "parameters": { "location": ["Tokyo", "London"] }
}

Output Plan:
{
  "steps": [
    {
      "step_number": 0,
      "tool_name": "get_weather_data",
      "parameters": { "location": "Tokyo" },
      "dependencies": [],
      "description": "Get weather for Tokyo",
      "requires_confirmation": false,
      "estimated_tokens": 100
    },
    {
      "step_number": 1,
      "tool_name": "get_weather_data",
      "parameters": { "location": "London" },
      "dependencies": [],
      "description": "Get weather for London",
      "requires_confirmation": false,
      "estimated_tokens": 100
    }
  ],
  "summary": "Get weather for Tokyo and London in parallel",
  "estimated_total_tokens": 200,
  "estimated_latency_ms": 2000
}

Input Intent:
{
  "type": "SCHEDULE",
  "parameters": { "action": "schedule_meeting", "with": "John", "when": "tomorrow 2pm" }
}

Output Plan:
{
  "steps": [
    {
      "step_number": 0,
      "tool_name": "check_availability",
      "parameters": { "person": "John", "date": "tomorrow", "time": "2pm" },
      "dependencies": [],
      "description": "Check if John is available tomorrow at 2pm",
      "requires_confirmation": false,
      "estimated_tokens": 150
    },
    {
      "step_number": 1,
      "tool_name": "create_calendar_event",
      "parameters": { "title": "Meeting with John", "date": "tomorrow", "time": "2pm" },
      "dependencies": [0],
      "description": "Create calendar event for meeting with John",
      "requires_confirmation": true,
      "estimated_tokens": 200
    }
  ],
  "summary": "Schedule a meeting with John tomorrow at 2pm, confirming availability first",
  "estimated_total_tokens": 350,
  "estimated_latency_ms": 3000
}`;

function buildPlanningPrompt(context: PlannerContext): string {
  const constraints = { ...DEFAULT_PLAN_CONSTRAINTS, ...context.constraints };
  
  // Dynamic tool injection: Use exact tool names from registry
  const toolList = context.available_tools?.length
    ? context.available_tools.map(t => `- ${t.name}: ${t.description}`).join('\n')
    : "NO_TOOLS_AVAILABLE";

  return PLANNING_PROMPT_TEMPLATE
    .replace("{max_steps}", String(constraints.max_steps))
    .replace("{available_tools}", toolList);
}

// ============================================================================
// CONVERT RAW PLAN TO CANONICAL PLAN
// Transform LLM output into validated Plan with UUIDs and proper structure
// ============================================================================

export function convertRawPlanToPlan(
  rawPlan: RawPlan,
  intent: Intent,
  constraints: PlanConstraints,
  modelId: string,
  availableTools: ToolDefinition[] = []
): Plan {
  const timestamp = new Date().toISOString();
  
  // Step 1: Detect and handle Fan-Out needs
  // If a step has an array parameter for a tool that expects a singleton,
  // we split that step into multiple parallel steps.
  const expandedSteps: RawPlanStep[] = [];
  let nextStepNumber = 0;
  const originalToNewStepIds = new Map<number, number[]>();

  for (const rawStep of rawPlan.steps) {
    const toolDef = availableTools.find(t => t.name === rawStep.tool_name);
    let fanOutParamKey: string | null = null;
    let fanOutValues: unknown[] | null = null;

    if (toolDef) {
      for (const [key, value] of Object.entries(rawStep.parameters)) {
        const propDef = toolDef.inputSchema.properties[key];
        if (propDef && Array.isArray(value) && ["string", "number", "boolean"].includes(propDef.type)) {
          fanOutParamKey = key;
          fanOutValues = value;
          break; // Only fan out on the first array parameter found
        }
      }
    }

    if (fanOutParamKey && fanOutValues && fanOutValues.length > 0) {
      const newStepNumbers: number[] = [];
      for (const value of fanOutValues) {
        const stepNum = nextStepNumber++;
        newStepNumbers.push(stepNum);
        expandedSteps.push({
          ...rawStep,
          step_number: stepNum,
          parameters: {
            ...rawStep.parameters,
            [fanOutParamKey]: value
          },
          description: `${rawStep.description} (${value})`
        });
      }
      originalToNewStepIds.set(rawStep.step_number, newStepNumbers);
    } else {
      const stepNum = nextStepNumber++;
      originalToNewStepIds.set(rawStep.step_number, [stepNum]);
      expandedSteps.push({
        ...rawStep,
        step_number: stepNum
      });
    }
  }

  // Update dependencies for expanded steps
  for (const step of expandedSteps) {
    const newDeps: number[] = [];
    for (const oldDepNum of step.dependencies) {
      const mappedNums = originalToNewStepIds.get(oldDepNum) || [];
      newDeps.push(...mappedNums);
    }
    step.dependencies = Array.from(new Set(newDeps));
  }

  // Step 2: Create step ID mapping (step_number -> UUID)
  const stepIdMap = new Map<number, string>();
  for (const step of expandedSteps) {
    stepIdMap.set(step.step_number, randomUUID());
  }

  // Step 3: Convert raw steps to canonical PlanSteps
  const steps: PlanStep[] = expandedSteps.map(rawStep => {
    // Convert dependency step_numbers to UUIDs
    const dependencyUuids = rawStep.dependencies
      .map(depNum => {
        const depId = stepIdMap.get(depNum);
        if (!depId) {
          throw new Error(`Invalid dependency: step ${rawStep.step_number} references non-existent step ${depNum}`);
        }
        return depId;
      });

    return PlanStepSchema.parse({
      id: stepIdMap.get(rawStep.step_number)!,
      step_number: rawStep.step_number,
      tool_name: rawStep.tool_name,
      tool_version: rawStep.tool_version,
      parameters: rawStep.parameters,
      dependencies: dependencyUuids,
      description: rawStep.description,
      requires_confirmation: rawStep.requires_confirmation,
      estimated_tokens: rawStep.estimated_tokens,
      timeout_ms: 30000, // Default 30s timeout per step
    });
  });

  // Step 4: Calculate total estimated tokens
  const totalEstimatedTokens = steps.reduce(
    (sum, step) => sum + (step.estimated_tokens || 0),
    0
  );

  // Step 5: Build and validate the Plan
  const plan: Plan = PlanSchema.parse({
    id: randomUUID(),
    intent_id: intent.id,
    steps,
    constraints,
    metadata: PlanMetadataSchema.parse({
      version: "1.0.0",
      created_at: timestamp,
      planning_model_id: modelId,
      estimated_total_tokens: totalEstimatedTokens,
      estimated_latency_ms: rawPlan.estimated_latency_ms,
    }),
    summary: rawPlan.summary,
  });

  return plan;
}

// ============================================================================
// VALIDATE PLAN CONSTRAINTS
// Check plan against constraints before returning
// ============================================================================

function validatePlanConstraints(
  plan: Plan,
  constraints: PlanConstraints
): { valid: boolean; error?: string } {
  // Check max steps
  if (plan.steps.length > constraints.max_steps) {
    return {
      valid: false,
      error: `Plan has ${plan.steps.length} steps, exceeds maximum of ${constraints.max_steps}. Total entities may exceed capacity.`,
    };
  }

  // Check token budget
  const totalTokens = plan.steps.reduce(
    (sum, step) => sum + (step.estimated_tokens || 0),
    0
  );
  if (totalTokens > constraints.max_total_tokens) {
    return {
      valid: false,
      error: `Plan estimated tokens (${totalTokens}) exceeds budget (${constraints.max_total_tokens})`,
    };
  }

  // All constraints satisfied
  return { valid: true };
}

// ============================================================================
// GENERATE PLAN
// Main entry point: generates validated plan from intent
// ============================================================================

export async function generatePlan(
  intent: Intent,
  context: PlannerContext = {}
): Promise<PlannerResult> {
  const startTime = performance.now();
  const timestamp = new Date().toISOString();

  try {
    // Validate intent
    if (!intent || !intent.id || !intent.type) {
      throw EngineErrorSchema.parse({
        code: "PLAN_GENERATION_FAILED",
        message: "Invalid intent: missing required fields (id, type)",
        details: { intent_provided: !!intent },
        recoverable: false,
        timestamp,
      });
    }

    // Merge constraints with defaults
    const constraints = PlanConstraintsSchema.parse({
      ...DEFAULT_PLAN_CONSTRAINTS,
      ...context.constraints,
    });

    // Fetch recent successful intentions for context injection
    const memory = getMemoryClient();
    const recentIntents = await memory.getRecentSuccessfulIntents(3);
    const contextHistory = recentIntents.map(s => ({
      input: s.intent?.rawText,
      summary: s.plan?.summary,
      status: s.status
    }));

    // Generate plan using LLM
    const basePrompt = JSON.stringify({
      intent_type: intent.type,
      parameters: intent.parameters,
      rawText: intent.rawText,
      explanation: intent.explanation,
      recent_successful_history: contextHistory,
    });

    const prompt = context.repairFeedback 
      ? `REPAIR INSTRUCTION: ${context.repairFeedback}\n\nORIGINAL INTENT: ${basePrompt}`
      : basePrompt;

    const generationResult: GenerateStructuredResult<RawPlan> = await generateStructured({
      modelType: "planning",
      prompt,
      systemPrompt: buildPlanningPrompt(context),
      schema: RawPlanSchema,
      temperature: context.repairFeedback ? 0.2 : 0.1, // Slightly higher temp for repair
      timeoutMs: 30000, // 30 second timeout for planning
    });

    const rawPlan = generationResult.data;
    const llmResponse = generationResult.response;

    // Convert to canonical plan
    let plan: Plan;
    try {
      plan = convertRawPlanToPlan(rawPlan, intent, constraints, llmResponse.model_id, context.available_tools);
    } catch (conversionError) {
      const errorMessage = conversionError instanceof Error 
        ? conversionError.message 
        : String(conversionError);
      
      throw EngineErrorSchema.parse({
        code: "PLAN_VALIDATION_FAILED",
        message: `Plan conversion failed: ${errorMessage}`,
        details: {
          raw_plan: rawPlan,
          error: errorMessage,
        },
        recoverable: false,
        timestamp,
      });
    }

    // Validate constraints
    const constraintValidation = validatePlanConstraints(plan, constraints);
    if (!constraintValidation.valid) {
      throw EngineErrorSchema.parse({
        code: "PLAN_VALIDATION_FAILED",
        message: constraintValidation.error!,
        details: {
          plan_step_count: plan.steps.length,
          plan_total_tokens: plan.metadata.estimated_total_tokens,
          constraints,
        },
        recoverable: false,
        timestamp,
      });
    }

    const endTime = performance.now();
    const latencyMs = Math.round(endTime - startTime);

    // Create trace entry
    const traceEntry: TraceEntry = TraceEntrySchema.parse({
      timestamp,
      phase: "planning",
      event: "plan_generated",
      input: { intent_id: intent.id, intent_type: intent.type },
      output: { plan_id: plan.id, step_count: plan.steps.length },
      latency_ms: latencyMs,
      model_id: llmResponse.model_id,
      token_usage: {
        prompt_tokens: llmResponse.token_usage.prompt_tokens,
        completion_tokens: llmResponse.token_usage.completion_tokens,
        total_tokens: llmResponse.token_usage.total_tokens,
      },
    });

    return {
      plan,
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
      code: "PLAN_GENERATION_FAILED",
      message: `Plan generation failed: ${errorMessage}`,
      details: {
        intent_id: intent?.id,
        intent_type: intent?.type,
        latency_ms: latencyMs,
      },
      recoverable: false,
      timestamp,
    });
  }
}

// ============================================================================
// VALIDATE PLAN DAG
// Explicit DAG validation (redundant with PlanSchema but explicit)
// ============================================================================

export function validatePlanDag(plan: Plan): { valid: boolean; cycles?: string[] } {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const cycles: string[] = [];

  function visit(stepId: string, path: string[]): boolean {
    if (recursionStack.has(stepId)) {
      // Found cycle
      const cycleStart = path.indexOf(stepId);
      const cycle = path.slice(cycleStart).concat([stepId]);
      cycles.push(cycle.join(" -> "));
      return false;
    }

    if (visited.has(stepId)) {
      return true;
    }

    visited.add(stepId);
    recursionStack.add(stepId);

    const step = plan.steps.find(s => s.id === stepId);
    if (step) {
      for (const depId of step.dependencies) {
        if (!visit(depId, [...path, stepId])) {
          return false;
        }
      }
    }

    recursionStack.delete(stepId);
    return true;
  }

  for (const step of plan.steps) {
    if (!visited.has(step.id)) {
      if (!visit(step.id, [])) {
        return { valid: false, cycles };
      }
    }
  }

  return { valid: true };
}

// ============================================================================
// GET PLAN TOPOLOGICAL ORDER
// Returns steps in dependency-resolved execution order
// ============================================================================

export function getTopologicalOrder(plan: Plan): PlanStep[] {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize
  for (const step of plan.steps) {
    inDegree.set(step.id, 0);
    adjacency.set(step.id, []);
  }

  // Build adjacency and count in-degrees
  for (const step of plan.steps) {
    for (const depId of step.dependencies) {
      adjacency.get(depId)!.push(step.id);
      inDegree.set(step.id, (inDegree.get(step.id) || 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue: string[] = [];
  const result: PlanStep[] = [];

  // Start with nodes having no dependencies
  Array.from(inDegree.keys()).forEach(stepId => {
    const degree = inDegree.get(stepId);
    if (degree === 0) {
      queue.push(stepId);
    }
  });

  while (queue.length > 0) {
    const stepId = queue.shift()!;
    const step = plan.steps.find(s => s.id === stepId)!;
    result.push(step);

    for (const dependentId of adjacency.get(stepId) || []) {
      const newDegree = (inDegree.get(dependentId) || 0) - 1;
      inDegree.set(dependentId, newDegree);
      if (newDegree === 0) {
        queue.push(dependentId);
      }
    }
  }

  // If not all steps were processed, there's a cycle
  if (result.length !== plan.steps.length) {
    throw new Error("Plan contains circular dependencies");
  }

  return result;
}
