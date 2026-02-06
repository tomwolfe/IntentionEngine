import { IntentClassification } from "./intent-schema";

/**
 * Classifies the user intent using a hybrid approach:
 * 1. Regex for obvious tool-use markers
 * 2. Regex for common "SIMPLE" intents (greetings, thanks, etc.)
 * 3. Fallback to LLM (handled by the caller if this returns something that needs LLM refinement)
 */
export function classifyIntent(input: string): IntentClassification {
  const normalized = input.toLowerCase().trim().replace(/[.,!?;:]/g, '');

  // Heuristic for TOOL_SEARCH
  const SEARCH_KEYWORDS = /\b(find|search|where|look for|nearby|restaurant|food|eat|dinner|lunch|breakfast|cafe|bar|pub)\b/i;
  // Heuristic for TOOL_CALENDAR
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

  // Explicit SIMPLE intents - greetings, thanks, etc.
  // If they don't have tool keywords, and they have these, they are SIMPLE with high confidence.
  const SIMPLE_KEYWORDS = /\b(hi|hello|hey|greetings|yo|morning|afternoon|evening|thanks|thank you|thx|ty|much appreciated|ok|okay|cool|got it|sure|yes|no|bye|goodbye|help)\b/i;
  
  if (SIMPLE_KEYWORDS.test(normalized)) {
    return {
      type: "SIMPLE",
      confidence: 1.0,
      reason: "Matched common simple intent keywords"
    };
  }

  // If it's very short but didn't match anything else, it's still likely simple
  if (normalized.length < 5) {
    return {
      type: "SIMPLE",
      confidence: 0.8,
      reason: "Short input with no tool-use markers"
    };
  }

  // Default to requiring further analysis (LLM)
  return {
    type: "SIMPLE",
    confidence: 0.5,
    reason: "No clear tool-use markers, defaulting to simple"
  };
}
