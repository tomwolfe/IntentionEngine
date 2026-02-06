import { z } from "zod";

export const IntentTypeSchema = z.enum(["SIMPLE", "TOOL_SEARCH", "TOOL_CALENDAR"]);
export type IntentType = z.infer<typeof IntentTypeSchema>;

export interface IntentClassification {
  type: IntentType;
  confidence: number;
  reason: string;
}

export { classifyIntent } from "./intent";
