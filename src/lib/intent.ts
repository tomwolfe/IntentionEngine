import { IntentClassification } from "./intent-schema";
import { Plan } from "./schema";
import { parseNaturalLanguageToDate } from "./date-utils";

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
 * Deterministically generates the muscle of the plan (ordered_steps).
 * The LLM will later provide the summary (the whisper).
 * 
 * TEMPORAL DETERMINISM: All dates are normalized to ISO-8601 timestamps
 * at the plan boundary using a request-scoped reference time.
 */
export function getDeterministicPlan(
  classification: IntentClassification,
  input: string,
  userLocation?: { lat: number; lng: number } | null,
  dnaCuisine?: string,
  referenceDate: Date = new Date()
): Partial<Plan> {
  const normalized = input.toLowerCase();
  const lat = userLocation?.lat || 51.5074;
  const lon = userLocation?.lng || -0.1278;

  // Extract date from input using request-scoped reference time
  // This ensures "tomorrow" resolves relative to when the request was made
  const parsedDate = parseNaturalLanguageToDate(input, referenceDate) || referenceDate;
  
  let startTime = parsedDate;
  const isTransport = classification.metadata?.isTransport;

  if (isTransport) {
    // Sacred Rule: Transport events start 2 hours before the target arrival time
    startTime = new Date(parsedDate.getTime() - 2 * 60 * 60 * 1000);
  }

  const dateStr = startTime.toISOString();
  
  // End time is always 2 hours later (Sacred Rule)
  const endDate = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
  const endDateStr = endDate.toISOString();

  // Simple cuisine extraction
  const CUISINE_LIST = ['italian', 'french', 'japanese', 'chinese', 'mexican', 'indian', 'spanish', 'thai', 'sushi', 'pizza', 'steak', 'seafood', 'burger', 'tapas', 'bistro'];
  const cuisineMatch = CUISINE_LIST.find(c => normalized.includes(c));
  
  // Vibe Bias: Use dnaCuisine for vague requests if no explicit cuisine is mentioned
  const isVague = VAGUE_PHRASES.some(phrase => normalized.includes(phrase));
  const cuisine = cuisineMatch || (isVague && dnaCuisine ? dnaCuisine : "any");

  if (classification.type === "TOOL_SEARCH") {
    return {
      intent_type: "dining",
      constraints: ["find restaurant", `near ${lat}, ${lon}`],
      ordered_steps: [
        {
          tool_name: "search_restaurant",
          parameters: { 
            cuisine,
            lat,
            lon,
            romantic: classification.isSpecialIntent
          },
          requires_confirmation: false,
          description: "Finding the perfect venue for you."
        }
      ]
    };
  }

  if (classification.type === "TOOL_CALENDAR" || classification.type === "COMPLEX_PLAN") {
    const steps = [];
    
    if (!isTransport && (classification.type === "COMPLEX_PLAN" || normalized.includes("restaurant") || normalized.includes("dinner") || normalized.includes("lunch"))) {
      steps.push({
        tool_name: "search_restaurant",
        parameters: { 
          cuisine,
          lat,
          lon,
          romantic: classification.isSpecialIntent
        },
        requires_confirmation: false,
        description: "Finding the perfect venue for you."
      });
    }

    if (isTransport) {
      steps.push({
        tool_name: "add_calendar_event",
        parameters: { 
          title: `Travel to ${classification.metadata?.location || 'Airport'}`,
          start_time: dateStr,
          end_time: endDateStr,
          location: classification.metadata?.location || (userLocation ? "Current Location" : "London")
        },
        requires_confirmation: false,
        description: "Securing your passage."
      });
    } else {
      steps.push({
        tool_name: "add_calendar_event",
        parameters: { 
          title: classification.isSpecialIntent ? "Special Occasion" : "Event",
          start_time: dateStr,
          end_time: endDateStr,
          location: "" // To be filled by restaurant result in client
        },
        requires_confirmation: true,
        description: "Preparing your calendar for the final act."
      });
    }

    return {
      intent_type: isTransport ? "transport" : (classification.type === "COMPLEX_PLAN" ? "dining_and_calendar" : "scheduling"),
      constraints: ["deterministic orchestration", isTransport ? "2-hour buffer" : "2-hour duration"],
      ordered_steps: steps
    };
  }

  return {
    intent_type: "simple_response",
    constraints: [],
    ordered_steps: []
  };
}

/**
 * Classifies the user intent using a hybrid approach:
 * 1. Keyword Score system to detect multi-intent or specific tool use
 * 2. Vibe Memory bias for vague requests
 * 3. Fallback to simple intent detection
 * 4. Default to requiring LLM refinement
 */
export async function classifyIntent(input: string): Promise<IntentClassification> {
  const normalized = input.toLowerCase().trim().replace(/[.,!?;:]/g, '');

  // Check for vague requests
  const isVagueRequest = VAGUE_PHRASES.some(phrase => normalized.includes(phrase));
  if (isVagueRequest) {
    return {
      type: "COMPLEX_PLAN", // Upgrade to complex plan for seamless orchestration
      confidence: 0.9,
      reason: "Vague request, triggering autonomous orchestration",
      isSpecialIntent: true
    };
  }

  // High-confidence special patterns
  const transportMatch = input.match(/(?:need to be at|be at|arrival at)\s+(.+?)\s+by\s+(.+)/i);
  if (transportMatch) {
    return { 
      type: "TOOL_CALENDAR", 
      confidence: 0.95, 
      reason: "Time-critical transportation request detected", 
      isSpecialIntent: true,
      metadata: {
        isTransport: true,
        location: transportMatch[1].trim(),
        targetTime: transportMatch[2].trim()
      }
    };
  }

  if (normalized.includes("airport") && /\bby\b\s+\d+/.test(normalized)) {
    return { 
      type: "TOOL_CALENDAR", 
      confidence: 0.95, 
      reason: "Airport time detected", 
      isSpecialIntent: true,
      metadata: { isTransport: true, location: "airport" }
    };
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
  // Steve Jobs: "Elegant Synthesis" - We detect the soul of the intent, not just its keywords.
  // When a desire is "special," the system must elevate its execution to match.

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