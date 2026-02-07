import { IntentClassification } from "./intent-schema";

/**
 * Classifies the user intent using a hybrid approach:
 * 1. Keyword Score system to detect multi-intent or specific tool use
 * 2. Fallback to simple intent detection
 * 3. Default to requiring LLM refinement
 */
export function classifyIntent(input: string): IntentClassification {
  const normalized = input.toLowerCase().trim().replace(/[.,!?;:]/g, '');

  const SEARCH_KEYWORDS = ['find', 'search', 'where', 'look for', 'nearby', 'restaurant', 'food', 'eat', 'dinner', 'lunch', 'breakfast', 'cafe', 'bar', 'pub'];
  const CALENDAR_KEYWORDS = ['plan', 'book', 'calendar', 'event', 'schedule', 'add to', 'meeting', 'appointment', 'reminder', 'ics'];
  const SPECIAL_KEYWORDS = ['special', 'romantic', 'anniversary', 'birthday', 'surprise', 'impress', 'date'];

  const words = normalized.split(/\s+/);
  
  let searchScore = 0;
  let calendarScore = 0;

  words.forEach(word => {
    if (SEARCH_KEYWORDS.includes(word)) searchScore++;
    if (CALENDAR_KEYWORDS.includes(word)) calendarScore++;
  });

  const isSpecialIntent = SPECIAL_KEYWORDS.some(kw => normalized.includes(kw));

  if (searchScore > 0 && calendarScore > 0) {
    return {
      type: "COMPLEX_PLAN",
      confidence: 0.95,
      reason: `Detected both search (${searchScore}) and calendar (${calendarScore}) keywords`,
      isSpecialIntent
    };
  }

  if (calendarScore > searchScore) {
    return {
      type: "TOOL_CALENDAR",
      confidence: 0.9,
      reason: `Calendar keywords (${calendarScore}) dominated search keywords (${searchScore})`,
      isSpecialIntent
    };
  }

  if (searchScore > calendarScore || (isSpecialIntent && searchScore === 0 && calendarScore === 0)) {
    return {
      type: "TOOL_SEARCH",
      confidence: 0.9,
      reason: isSpecialIntent && searchScore === 0 ? "Special intent detected, defaulting to search" : `Search keywords (${searchScore}) dominated calendar keywords (${calendarScore})`,
      isSpecialIntent
    };
  }

  // Explicit SIMPLE intents - greetings, thanks, etc.
  const EXACT_SIMPLE_STRINGS = [
    'hi', 'hello', 'hey', 'thanks', 'thank you', 'thx', 'ty', 
    'much appreciated', 'ok', 'okay', 'cool', 'got it', 'sure', 
    'yes', 'no', 'bye', 'goodbye', 'help'
  ];
  
  if (EXACT_SIMPLE_STRINGS.includes(normalized)) {
    return {
      type: "SIMPLE",
      confidence: 1.0,
      reason: "Matched exact simple intent string"
    };
  }

  const SIMPLE_KEYWORDS = ['hi', 'hello', 'hey', 'greetings', 'yo', 'morning', 'afternoon', 'evening', 'thanks', 'thank you', 'thx', 'ty', 'much appreciated', 'ok', 'okay', 'cool', 'got it', 'sure', 'yes', 'no', 'bye', 'goodbye', 'help'];
  
  let simpleScore = 0;
  words.forEach(word => {
    if (SIMPLE_KEYWORDS.includes(word)) simpleScore++;
  });

  if (simpleScore > 0) {
    return {
      type: "SIMPLE",
      confidence: 0.9,
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
