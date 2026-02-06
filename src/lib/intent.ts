import { IntentClassification } from "./intent-schema";

/**
 * Classifies the user intent based on keyword matching.
 * Replaces old length-based heuristics with standardized regex patterns.
 */
export function classifyIntent(input: string): IntentClassification {
  const normalized = input.toLowerCase().trim();

  const SEARCH_KEYWORDS = /\b(find|search|where|look for|nearby|restaurant|food|eat|dinner|lunch|breakfast|cafe|bar|pub)\b/i;
  const CALENDAR_KEYWORDS = /\b(plan|book|calendar|event|schedule|add to|meeting|appointment|reminder|ics)\b/i;

  if (CALENDAR_KEYWORDS.test(normalized)) {
    return {
      type: "TOOL_CALENDAR",
      confidence: 0.9,
      reason: "Detected calendar-related keywords"
    };
  }

  if (SEARCH_KEYWORDS.test(normalized)) {
    return {
      type: "TOOL_SEARCH",
      confidence: 0.9,
      reason: "Detected search-related keywords"
    };
  }

  return {
    type: "SIMPLE",
    confidence: 1.0,
    reason: "No tool-use markers identified"
  };
}
