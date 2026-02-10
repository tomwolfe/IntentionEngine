import { z } from "zod";

/**
 * IntentType defines the broad categories of user goals.
 * Keeping this under 5 types to maintain clarity and focus as per Phase 1.
 */
export const IntentTypeSchema = z.enum([
  "SCHEDULE", // Tasks related to time, calendar, or reminders
  "SEARCH",   // Informational searches or finding physical locations/entities
  "ACTION",   // Requests to perform a specific operation or state change
  "QUERY",    // General knowledge questions or status checks
  "PLANNING", // Multi-step goals requiring complex orchestration
  "UNKNOWN"   // Fallback when the intent is ambiguous or unsupported
]);

export type IntentType = z.infer<typeof IntentTypeSchema>;

/**
 * The canonical Intent schema.
 * This represents the structured interpretation of a raw user input.
 */
export const IntentSchema = z.object({
  type: IntentTypeSchema,
  confidence: z.number().min(0).max(1), // 0 to 1 score of how certain the model is
  parameters: z.record(z.string(), z.any()), // Key-value map of extracted parameters (e.g., date, location)
  rawText: z.string(), // The original input that generated this intent
});

export type Intent = z.infer<typeof IntentSchema>;

export const RestaurantResultSchema = z.object({
  name: z.string(),
  address: z.string(),
  coordinates: z.object({
    lat: z.number(),
    lon: z.number(),
  }),
});

export type RestaurantResult = z.infer<typeof RestaurantResultSchema>;

export const StepSchema = z.object({
  tool_name: z.string(),
  parameters: z.record(z.string(), z.any()),
  requires_confirmation: z.boolean(),
  description: z.string(), // Human readable description of the step
});

export const PlanSchema = z.object({
  intent_type: z.string(),
  constraints: z.array(z.string()),
  ordered_steps: z.array(StepSchema),
  summary: z.string(),
});

export type Step = z.infer<typeof StepSchema>;
export type Plan = z.infer<typeof PlanSchema>;

export const IntentResponseSchema = z.object({
  plan: PlanSchema,
  audit_log_id: z.string(),
});
