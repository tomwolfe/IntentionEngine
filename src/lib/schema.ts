import { z } from "zod";

/**
 * IntentType defines the broad categories of user goals.
 * Keeping this under 5 types to maintain clarity and focus as per Phase 1.
 */
export const IntentTypeSchema = z.enum([
  "SCHEDULE",
  "SEARCH",
  "ACTION",
  "QUERY",
  "PLANNING",
  "ANALYSIS",
  "UNKNOWN",
  "CLARIFICATION_REQUIRED",
  "REFUSED"
]);

export type IntentType = z.infer<typeof IntentTypeSchema>;

/**
 * Metadata for traceability and audit.
 */
export const IntentMetadataSchema = z.object({
  version: z.string(),
  timestamp: z.string(), // ISO-8601
  source: z.string().default("user_input"),
  model_id: z.string().optional(),
});

/**
 * The canonical Intent schema.
 */
export const IntentSchema = z.object({
  id: z.string().uuid(),
  parent_intent_id: z.string().uuid().optional(), // Link to the intent this one supersedes
  type: IntentTypeSchema,
  confidence: z.number().min(0).max(1),
  parameters: z.record(z.string(), z.any()),
  rawText: z.string(),
  explanation: z.string().optional(), // Why this intent was chosen
  hash: z.string().optional(), // SHA-256 hash for immutable linking
  metadata: IntentMetadataSchema,
});

export type Intent = z.infer<typeof IntentSchema>;

export const RestaurantResultSchema = z.object({
  name: z.string(),
  address: z.string(),
  cuisine: z.array(z.string()).optional(),
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
