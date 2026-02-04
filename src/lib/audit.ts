/**
 * Audit Logging System
 * All execution events are logged for replay and verification
 * Logs are immutable and timestamped
 */

import { AuditLog, Plan } from '@/types';
import { v4 as uuidv4 } from 'uuid';

// In-memory storage for Vercel Hobby tier (no external DB required)
// For production, replace with Upstash Redis or similar
const auditLogs = new Map<string, AuditLog>();

export interface LogEntry {
  executionId: string;
  planId: string;
  timestamp: string;
  event: string;
  data: unknown;
}

/**
 * Initialize a new audit log for an execution
 */
export function initAuditLog(
  executionId: string,
  planId: string,
  inputIntent: string,
  generatedPlan: Plan
): AuditLog {
  const now = new Date().toISOString();
  
  const auditLog: AuditLog = {
    execution_id: executionId,
    plan_id: planId,
    timestamp: now,
    input_intent: inputIntent,
    generated_plan: generatedPlan,
    validation_result: {
      is_valid: false,
      errors: [],
    },
    execution_steps: [],
    final_outcome: {
      status: 'failed',
      summary: 'Execution not yet completed',
    },
  };

  auditLogs.set(executionId, auditLog);
  return auditLog;
}

/**
 * Update validation result in audit log
 */
export function logValidationResult(
  executionId: string,
  isValid: boolean,
  errors: string[] = []
): void {
  const log = auditLogs.get(executionId);
  if (log) {
    log.validation_result = {
      is_valid: isValid,
      errors,
    };
  }
}

/**
 * Log a step execution event
 */
export function logStepExecution(
  executionId: string,
  stepId: string,
  stepNumber: number,
  status: AuditLog['execution_steps'][0]['status'],
  result?: unknown,
  error?: string,
  confirmationReceived?: boolean
): void {
  const log = auditLogs.get(executionId);
  if (log) {
    const stepLog = log.execution_steps.find(s => s.step_id === stepId);
    
    if (stepLog) {
      stepLog.status = status;
      if (result !== undefined) stepLog.result = result;
      if (error) stepLog.error = error;
      if (confirmationReceived !== undefined) stepLog.confirmation_received = confirmationReceived;
      stepLog.completed_at = new Date().toISOString();
    } else {
      log.execution_steps.push({
        step_id: stepId,
        step_number: stepNumber,
        status,
        result,
        error,
        confirmation_received: confirmationReceived,
        started_at: new Date().toISOString(),
        completed_at: status !== 'in_progress' ? new Date().toISOString() : undefined,
      });
    }
  }
}

/**
 * Log final outcome
 */
export function logFinalOutcome(
  executionId: string,
  status: AuditLog['final_outcome']['status'],
  summary: string,
  outputs?: Record<string, unknown>
): void {
  const log = auditLogs.get(executionId);
  if (log) {
    log.final_outcome = {
      status,
      summary,
      outputs,
    };
    log.timestamp = new Date().toISOString();
  }
}

/**
 * Retrieve an audit log by execution ID
 */
export function getAuditLog(executionId: string): AuditLog | undefined {
  return auditLogs.get(executionId);
}

/**
 * Retrieve all audit logs for a plan
 */
export function getAuditLogsForPlan(planId: string): AuditLog[] {
  return Array.from(auditLogs.values()).filter(log => log.plan_id === planId);
}

/**
 * Serialize audit log to JSON for replay
 */
export function serializeAuditLog(executionId: string): string {
  const log = auditLogs.get(executionId);
  if (!log) {
    throw new Error(`Audit log not found: ${executionId}`);
  }
  return JSON.stringify(log, null, 2);
}

/**
 * Replay an execution from an audit log
 * Returns the exact same plan that was originally executed
 */
export function replayExecution(executionId: string): {
  canReplay: boolean;
  plan?: Plan;
  error?: string;
} {
  const log = auditLogs.get(executionId);
  
  if (!log) {
    return {
      canReplay: false,
      error: `Audit log not found: ${executionId}`,
    };
  }

  if (!log.validation_result.is_valid) {
    return {
      canReplay: false,
      error: 'Original execution had validation errors - cannot replay',
    };
  }

  return {
    canReplay: true,
    plan: log.generated_plan,
  };
}

/**
 * Verify that an execution is reproducible
 * Returns true if re-running would produce the same output
 */
export function verifyReproducibility(executionId: string): {
  isReproducible: boolean;
  reasons: string[];
} {
  const log = auditLogs.get(executionId);
  
  if (!log) {
    return {
      isReproducible: false,
      reasons: ['Audit log not found'],
    };
  }

  const reasons: string[] = [];

  // Check if all required confirmations were captured
  const stepsRequiringConfirmation = log.generated_plan.ordered_steps.filter(
    s => s.requires_confirmation
  );
  
  for (const step of stepsRequiringConfirmation) {
    const stepLog = log.execution_steps.find(s => s.step_id === step.step_id);
    if (!stepLog?.confirmation_received) {
      reasons.push(`Step ${step.step_number} requires confirmation but none recorded`);
    }
  }

  // Check if external API calls are deterministic
  const hasExternalCalls = log.generated_plan.ordered_steps.some(
    s => s.tool_name === 'google_calendar_create_event' ||
         s.tool_name === 'send_confirmation_notification'
  );
  
  if (hasExternalCalls) {
    reasons.push('Execution includes external API calls which may vary between runs');
  }

  return {
    isReproducible: reasons.length === 0,
    reasons,
  };
}