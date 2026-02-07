import { z } from "zod";

export const RestaurantResultSchema = z.object({
  name: z.string(),
  address: z.string(),
  coordinates: z.object({
    lat: z.number(),
    lon: z.number(),
  }),
  suggested_wine: z.string().optional(),
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

export const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string().optional(),
      role: z.enum(["user", "assistant", "system", "tool"]),
      content: z.string().optional(),
      parts: z.array(z.any()).optional(),
    })
  ),
  userLocation: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).nullable().optional(),
});

export const IntentResponseSchema = z.object({
  plan: PlanSchema,
  audit_log_id: z.string(),
});
