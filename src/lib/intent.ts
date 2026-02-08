import { IntentClassification } from "./intent-schema";
import { cache } from "./cache";

const VIBE_MEMORY_KEY = "vibe_memory:special_cuisines";

const VAGUE_PHRASES = [
  'somewhere nice',
  'something good',
  'a place',
  'a good spot',
  'where to eat',
  'somewhere good',
  'a nice place',
  'good restaurant',
  'nice restaurant'
];

/**
 * Classifies the user intent using a hybrid approach:
 * 1. Keyword Score system to detect multi-intent or specific tool use
 * 2. Vibe Memory bias for vague requests
 * 3. Fallback to simple intent detection
 * 4. Default to requiring LLM refinement
 */
export async function classifyIntent(input: string): Promise<IntentClassification> {
  const normalized = input.toLowerCase().trim().replace(/[.,!?;:]/g, '');

  // Check for vague requests with Vibe Memory bias
  const isVagueRequest = VAGUE_PHRASES.some(phrase => normalized.includes(phrase));
  if (isVagueRequest) {
    const vibeMemory = await cache.get<string[]>(VIBE_MEMORY_KEY);
    if (vibeMemory && vibeMemory.length > 0) {
      return {
        type: "TOOL_SEARCH",
        confidence: 0.95,
        reason: `Vague request with strong vibe memory: ${vibeMemory[0]}`,
        isSpecialIntent: false
      };
    }
  }

  // High-confidence special patterns
  if (normalized.includes("airport") && /\bby\b\s+\d+/.test(normalized)) {
    return { type: "TOOL_CALENDAR", confidence: 0.95, reason: "Airport time detected", isSpecialIntent: true };
  }
  if (normalized.includes("call") && (normalized.includes("remind") || /\bcall\s+(the\s+)?(mom|dad|wife|husband|boss|friend|doctor|dentist|him|her|them)\b/.test(normalized))) {
    return { type: "TOOL_CALENDAR", confidence: 0.95, reason: "Call reminder detected", isSpecialIntent: true };
  }
  if (normalized.includes("book a flight") || /\btrip to\b/.test(normalized)) {
    return { type: "TOOL_CALENDAR", confidence: 0.95, reason: "Trip planning detected", isSpecialIntent: true };
  }

  const SEARCH_KEYWORDS = ['find', 'search', 'where', 'look for', 'nearby', 'restaurant', 'food', 'eat', 'dinner', 'lunch', 'breakfast', 'cafe', 'bar', 'pub'];
  const CALENDAR_KEYWORDS = ['plan', 'book', 'calendar', 'event', 'schedule', 'add to', 'meeting', 'appointment', 'reminder', 'ics'];
  const SPECIAL_KEYWORDS = ['special', 'romantic', 'anniversary', 'birthday', 'surprise', 'impress', 'date', 'proposal', 'celebration', 'exclusive', 'high-end', 'fancy', 'intimate'];

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