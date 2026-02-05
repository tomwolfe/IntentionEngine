import { z } from "zod";

export const IntentTypeSchema = z.enum(["SIMPLE", "TOOL_SEARCH", "TOOL_CALENDAR"]);
export type IntentType = z.infer<typeof IntentTypeSchema>;

export interface IntentClassification {
  type: IntentType;
  confidence: number;
  reason: string;
}

export function classifyIntent(input: string): IntentClassification {
  const normalized = input.toLowerCase().trim();
  
  // Keyword-based heuristic for now, matching the requirements
  const hasCalendar = /\b(book|calendar|event|schedule|add to)\b/.test(normalized);
  const hasSearch = /\b(find|search|where|look for|nearby)\b/.test(normalized);
  
  if (hasCalendar) {
    return {
      type: "TOOL_CALENDAR",
      confidence: 0.9,
      reason: "Detected calendar-related keywords"
    };
  }
  
  if (hasSearch) {
    return {
      type: "TOOL_SEARCH",
      confidence: 0.9,
      reason: "Detected search-related keywords"
    };
  }
  
  // If it doesn't match tool keywords, it's a SIMPLE intent
  return {
    type: "SIMPLE",
    confidence: 1.0,
    reason: "No tool-use markers identified"
  };
}
