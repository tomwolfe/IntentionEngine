/**
 * Plan Validator - Validates LLM output against strict schema
 * All validation must be deterministic and auditable
 */

import { Plan, PlanSchema, AuditLog } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export interface ValidationResult {
  isValid: boolean;
  plan?: Plan;
  errors: string[];
}

/**
 * Validates a plan against the strict schema
 * This is deterministic - same input always produces same result
 */
export function validatePlan(rawPlan: unknown): ValidationResult {
  const errors: string[] = [];

  try {
    // Check if rawPlan is an object
    if (!rawPlan || typeof rawPlan !== 'object') {
      return {
        isValid: false,
        errors: ['Plan must be a valid JSON object'],
      };
    }

    // Check for extra fields not in schema (strict validation)
    const allowedTopLevelKeys = [
      'plan_id', 'intent_type', 'intent_summary', 'constraints',
      'ordered_steps', 'fallback_actions', 'created_at', 'expires_at'
    ];
    
    const planKeys = Object.keys(rawPlan as object);
    const extraKeys = planKeys.filter(key => !allowedTopLevelKeys.includes(key));
    
    if (extraKeys.length > 0) {
      errors.push(`Plan contains unexpected top-level fields: ${extraKeys.join(', ')}`);
    }

    // Check for free text contamination
    const planString = JSON.stringify(rawPlan);
    const jsonStructure = planString.match(/[{[\]}:,\"]/g)?.length || 0;
    const totalChars = planString.length;
    
    // If more than 10% is non-structural characters, might contain free text
    if ((totalChars - jsonStructure) / totalChars > 0.9) {
      errors.push('Plan may contain free text outside JSON structure');
    }

    // Zod schema validation
    const parseResult = PlanSchema.safeParse(rawPlan);
    
    if (!parseResult.success) {
      errors.push(...parseResult.error.errors.map(e => 
        `${e.path.join('.')}: ${e.message}`
      ));
      return {
        isValid: false,
        errors,
      };
    }

    // Additional semantic validation
    const plan = parseResult.data;

    // Validate step ordering
    const stepNumbers = plan.ordered_steps.map(s => s.step_number);
    const expectedNumbers = Array.from({ length: stepNumbers.length }, (_, i) => i + 1);
    
    if (JSON.stringify(stepNumbers.sort((a, b) => a - b)) !== JSON.stringify(expectedNumbers)) {
      errors.push('Steps must be numbered sequentially starting from 1');
    }

    // Validate no duplicate step_ids
    const stepIds = plan.ordered_steps.map(s => s.step_id);
    if (new Set(stepIds).size !== stepIds.length) {
      errors.push('Duplicate step_id found');
    }

    // Validate that irreversible actions require confirmation
    const irreversibleTools = ['google_calendar_create_event', 'send_confirmation_notification'];
    plan.ordered_steps.forEach(step => {
      if (irreversibleTools.includes(step.tool_name) && !step.requires_confirmation) {
        errors.push(`Step ${step.step_number} (${step.tool_name}) must require confirmation`);
      }
    });

    // Validate created_at is reasonable (within last 5 minutes)
    const createdAt = new Date(plan.created_at);
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    
    if (createdAt < fiveMinutesAgo || createdAt > now) {
      errors.push('Plan created_at timestamp is outside acceptable range');
    }

    return {
      isValid: errors.length === 0,
      plan: errors.length === 0 ? plan : undefined,
      errors,
    };

  } catch (error) {
    return {
      isValid: false,
      errors: [`Validation exception: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

/**
 * Validates that a string is valid JSON
 */
export function validateJsonStructure(input: string): { isValid: boolean; parsed?: unknown; error?: string } {
  try {
    const parsed = JSON.parse(input);
    return { isValid: true, parsed };
  } catch (error) {
    return {
      isValid: false,
      error: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Checks if any tool name is not in the allowed list
 * This prevents hallucinated tools
 */
export function validateToolNames(plan: Plan): string[] {
  const allowedTools = [
    'google_calendar_create_event',
    'google_calendar_find_slots',
    'validate_time_constraint',
    'send_confirmation_notification',
    'generate_deep_link',
    'wait_for_user_input'
  ];

  const errors: string[] = [];
  
  plan.ordered_steps.forEach(step => {
    if (!allowedTools.includes(step.tool_name)) {
      errors.push(`Invalid tool_name: ${step.tool_name}. Must be one of: ${allowedTools.join(', ')}`);
    }
  });

  return errors;
}