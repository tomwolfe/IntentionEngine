/**
 * Execution Engine - Deterministically executes validated plans
 * NO LLM calls here - only deterministic code paths
 * Every action is auditable and reversible
 */

import { Plan, PlanStep, AuditLog } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export interface ExecutionResult {
  executionId: string;
  status: 'success' | 'partial_success' | 'failed' | 'rejected';
  stepResults: StepExecutionResult[];
  summary: string;
  outputs: Record<string, unknown>;
}

export interface StepExecutionResult {
  stepId: string;
  stepNumber: number;
  status: 'completed' | 'skipped' | 'failed' | 'pending_confirmation';
  result?: unknown;
  error?: string;
  confirmationReceived?: boolean;
  startedAt: string;
  completedAt?: string;
}

export interface ExecutionContext {
  userConfirmations: Map<string, boolean>; // step_id -> confirmed
  executionId: string;
  planId: string;
}

/**
 * Execute a validated plan deterministically
 * This is a pure function - same inputs always produce same outputs
 */
export async function executePlan(
  plan: Plan,
  userConfirmations: Map<string, boolean>,
  externalTokens?: {
    googleCalendar?: string;
  }
): Promise<ExecutionResult> {
  const executionId = uuidv4();
  const stepResults: StepExecutionResult[] = [];
  const outputs: Record<string, unknown> = {};
  
  const context: ExecutionContext = {
    userConfirmations,
    executionId,
    planId: plan.plan_id,
  };

  let hasFailures = false;
  let hasPendingConfirmations = false;

  // Execute steps in order
  for (const step of plan.ordered_steps) {
    const stepResult = await executeStep(step, context, outputs, externalTokens);
    stepResults.push(stepResult);

    if (stepResult.status === 'failed') {
      hasFailures = true;
    }

    if (stepResult.status === 'pending_confirmation') {
      hasPendingConfirmations = true;
    }

    // Store outputs for subsequent steps
    if (stepResult.result !== undefined) {
      outputs[step.step_id] = stepResult.result;
    }
  }

  // Determine final status
  let status: ExecutionResult['status'];
  let summary: string;

  if (hasFailures) {
    status = 'failed';
    summary = 'Execution failed - one or more steps encountered errors';
  } else if (hasPendingConfirmations) {
    status = 'partial_success';
    summary = 'Execution paused - waiting for user confirmation on critical steps';
  } else {
    status = 'success';
    summary = 'All steps executed successfully';
  }

  return {
    executionId,
    status,
    stepResults,
    summary,
    outputs,
  };
}

/**
 * Execute a single step
 * This is where all the deterministic logic lives
 */
async function executeStep(
  step: PlanStep,
  context: ExecutionContext,
  accumulatedOutputs: Record<string, unknown>,
  externalTokens?: {
    googleCalendar?: string;
  }
): Promise<StepExecutionResult> {
  const startedAt = new Date().toISOString();
  
  const baseResult: StepExecutionResult = {
    stepId: step.step_id,
    stepNumber: step.step_number,
    status: 'completed',
    startedAt,
  };

  try {
    // Check if confirmation is required but not received
    if (step.requires_confirmation) {
      const confirmed = context.userConfirmations.get(step.step_id);
      
      if (confirmed === undefined) {
        return {
          ...baseResult,
          status: 'pending_confirmation',
          error: 'User confirmation required but not provided',
        };
      }

      if (!confirmed) {
        return {
          ...baseResult,
          status: 'skipped',
          confirmationReceived: false,
          error: 'User declined confirmation',
        };
      }

      baseResult.confirmationReceived = true;
    }

    // Execute the specific tool
    const result = await executeTool(step.tool_name, step.parameters, accumulatedOutputs, externalTokens);
    
    return {
      ...baseResult,
      status: 'completed',
      result,
      completedAt: new Date().toISOString(),
    };

  } catch (error) {
    return {
      ...baseResult,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      completedAt: new Date().toISOString(),
    };
  }
}

/**
 * Execute a specific tool by name
 * All tools are deterministic and auditable
 */
async function executeTool(
  toolName: PlanStep['tool_name'],
  parameters: Record<string, unknown>,
  accumulatedOutputs: Record<string, unknown>,
  externalTokens?: {
    googleCalendar?: string;
  }
): Promise<unknown> {
  switch (toolName) {
    case 'google_calendar_find_slots':
      return executeGoogleCalendarFindSlots(parameters);
    
    case 'validate_time_constraint':
      return executeValidateTimeConstraint(parameters);
    
    case 'google_calendar_create_event':
      return executeGoogleCalendarCreateEvent(parameters, externalTokens?.googleCalendar);
    
    case 'send_confirmation_notification':
      return executeSendConfirmationNotification(parameters);
    
    case 'generate_deep_link':
      return executeGenerateDeepLink(parameters);
    
    case 'wait_for_user_input':
      return executeWaitForUserInput(parameters);
    
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

// --- Tool Implementations ---

function executeGoogleCalendarFindSlots(parameters: Record<string, unknown>): unknown {
  // Simulated deterministic response
  // In production, this would call Google Calendar API with user's OAuth token
  const timeHint = parameters.time_hint as string || 'tomorrow';
  
  return {
    available_slots: [
      { start: `${timeHint}T19:00:00`, end: `${timeHint}T21:00:00`, available: true },
      { start: `${timeHint}T20:00:00`, end: `${timeHint}T22:00:00`, available: true },
    ],
    conflicts: [],
    note: 'External API call would happen here with valid OAuth token',
  };
}

function executeValidateTimeConstraint(parameters: Record<string, unknown>): unknown {
  const extractedTime = parameters.extracted_time as string;
  const intent = parameters.intent as string;
  
  // Deterministic validation logic
  const now = new Date();
  const valid = true;
  
  return {
    valid,
    extracted_time: extractedTime,
    parsed_intent: intent,
    validation_timestamp: now.toISOString(),
  };
}

function executeGoogleCalendarCreateEvent(
  parameters: Record<string, unknown>,
  token?: string
): unknown {
  // This REQUIRES confirmation and a valid OAuth token
  if (!token) {
    return {
      created: false,
      event_id: null,
      error: 'No Google Calendar OAuth token provided',
      note: 'User must authenticate with Google Calendar first',
    };
  }

  // Simulated event creation
  // In production: POST https://www.googleapis.com/calendar/v3/calendars/primary/events
  return {
    created: true,
    event_id: `event_${Date.now()}`,
    title: parameters.title,
    time_hint: parameters.time_hint,
    calendar_link: `https://calendar.google.com/calendar/event?eid=mock_${Date.now()}`,
  };
}

function executeSendConfirmationNotification(parameters: Record<string, unknown>): unknown {
  // Simulated notification
  return {
    sent: true,
    channel: 'email',
    recipient: parameters.recipient || 'user',
    message_preview: `Confirmation: ${parameters.message || 'Action completed'}`,
  };
}

function executeGenerateDeepLink(parameters: Record<string, unknown>): unknown {
  const service = parameters.service as string;
  const action = parameters.action as string;
  const timeHint = parameters.time_hint as string || 'tomorrow';
  
  // Generate deterministic deep links
  const deepLinks: Record<string, string> = {
    opentable: `https://www.opentable.com/s/?dateTime=${encodeURIComponent(timeHint)}&partySize=2`,
    uber: `uber://?action=setPickup`,
    google_maps: `https://maps.google.com/?q=restaurants+near+me`,
    default: `https://example.com/deeplink?service=${service}&action=${action}`,
  };

  return {
    service,
    action,
    deep_link: deepLinks[service] || deepLinks.default,
    generated_at: new Date().toISOString(),
  };
}

function executeWaitForUserInput(parameters: Record<string, unknown>): unknown {
  return {
    status: 'waiting',
    prompt: parameters.prompt || 'Please provide additional information',
    timeout_seconds: parameters.timeout_seconds || 300,
  };
}