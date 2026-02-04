import { z } from 'zod';

export const PlanStepSchema = z.object({
  step_id: z.string().uuid(),
  step_number: z.number().int().positive(),
  tool_name: z.enum([
    'google_calendar_create_event',
    'google_calendar_find_slots',
    'validate_time_constraint',
    'send_confirmation_notification',
    'generate_deep_link',
    'wait_for_user_input'
  ]),
  parameters: z.record(z.unknown()),
  requires_confirmation: z.boolean().default(false),
  description: z.string().min(1).max(500),
  expected_outcome: z.string().min(1).max(500),
});

export const PlanSchema = z.object({
  plan_id: z.string().uuid(),
  intent_type: z.enum([
    'schedule_event',
    'modify_event',
    'find_information',
    'send_message',
    'create_reminder',
    'plan_meeting'
  ]),
  intent_summary: z.string().min(1).max(200),
  constraints: z.object({
    time_constraints: z.array(z.string()).optional(),
    location_constraints: z.array(z.string()).optional(),
    participant_constraints: z.array(z.string()).optional(),
    budget_constraints: z.array(z.string()).optional(),
  }),
  ordered_steps: z.array(PlanStepSchema).min(1).max(20),
  fallback_actions: z.array(z.object({
    condition: z.string(),
    action: z.string(),
  })).optional(),
  created_at: z.string().datetime(),
  expires_at: z.string().datetime().optional(),
});

export const AuditLogSchema = z.object({
  execution_id: z.string().uuid(),
  plan_id: z.string().uuid(),
  timestamp: z.string().datetime(),
  input_intent: z.string(),
  generated_plan: PlanSchema,
  validation_result: z.object({
    is_valid: z.boolean(),
    errors: z.array(z.string()).optional(),
  }),
  execution_steps: z.array(z.object({
    step_id: z.string().uuid(),
    step_number: z.number(),
    status: z.enum(['pending', 'in_progress', 'completed', 'skipped', 'failed']),
    started_at: z.string().datetime().optional(),
    completed_at: z.string().datetime().optional(),
    result: z.unknown().optional(),
    error: z.string().optional(),
    confirmation_received: z.boolean().optional(),
  })),
  final_outcome: z.object({
    status: z.enum(['success', 'partial_success', 'failed', 'rejected']),
    summary: z.string(),
    outputs: z.record(z.unknown()).optional(),
  }),
});

export type Plan = z.infer<typeof PlanSchema>;
export type PlanStep = z.infer<typeof PlanStepSchema>;
export type AuditLog = z.infer<typeof AuditLogSchema>;