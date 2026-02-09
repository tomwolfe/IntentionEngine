import { z } from "zod";

export const IntentTypeSchema = z.enum(["SIMPLE", "TOOL_SEARCH", "TOOL_CALENDAR", "COMPLEX_PLAN"]);
export type IntentType = z.infer<typeof IntentTypeSchema>;

export interface IntentClassification {
  type: IntentType;
  confidence: number;
  reason: string;
  isSpecialIntent?: boolean;
  metadata?: Record<string, any>;
}

export { classifyIntent } from "./intent";
export type { classifyIntent as classifyIntentType } from "./intent";
