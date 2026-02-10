import { IntentClassification } from "./intent-schema";
import { Plan } from "./schema";
import * as chrono from "chrono-node";

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
 * Registry-based intent mapping system.
 * Each entry defines its triggers and how to generate the deterministic steps.
 */
interface RegistryEntry {
  trigger: (classification: IntentClassification, input: string) => boolean;
  generateSteps: (
    classification: IntentClassification,
    input: string,
    context: {
      lat: number;
      lon: number;
      cuisine: string;
      dateStr: string;
      endDateStr: string;
    }
  ) => Partial<Plan>;
}

const PLAN_REGISTRY: Record<string, RegistryEntry> = {
  WEEKEND_GETAWAY: {
    trigger: (c) => !!c.metadata?.isWeekendGetaway,
    generateSteps: (c, input, { lat, lon, cuisine, dateStr }) => {
      const fridayDinner = new Date(dateStr);
      fridayDinner.setHours(19, 0, 0, 0);
      const saturdayActivity = new Date(new Date(dateStr).getTime() + 24 * 60 * 60 * 1000);
      saturdayActivity.setHours(11, 0, 0, 0);

      return {
        intent_type: "weekend_getaway",
        constraints: ["Weekend orchestration", "multiple events"],
        ordered_steps: [
          {
            tool_name: "search_restaurant",
            parameters: { cuisine, lat, lon, romantic: true },
            requires_confirmation: false,
            description: "Finding a perfect Friday dinner spot."
          },
          {
            tool_name: "find_event",
            parameters: { query: "popular activity", lat, lon, date: saturdayActivity.toISOString() },
            requires_confirmation: false,
            description: "Discovering a Saturday adventure."
          },
          {
            tool_name: "add_calendar_event",
            parameters: { 
              title: "Weekend Getaway",
              start_time: fridayDinner.toISOString(),
              end_time: saturdayActivity.toISOString(),
              location: "Weekend Destination",
              description: "Your perfectly curated weekend escape."
            },
            requires_confirmation: true,
            description: "Synthesizing your getaway."
          }
        ]
      };
    }
  },
  AIRPORT_TRANSFER: {
    trigger: (c, input) => input.toLowerCase().includes("airport") || !!c.metadata?.isTransport,
    generateSteps: (c, input, { lat, lon, dateStr, endDateStr }) => {
      const location = c.metadata?.location || "Airport";
      return {
        intent_type: "airport_transfer",
        constraints: ["2-hour buffer", "Geospatial routing"],
        ordered_steps: [
          {
            tool_name: "geocode_location",
            parameters: { location },
            requires_confirmation: false,
            description: `Locating ${location}.`
          },
          {
            tool_name: "get_directions",
            parameters: { 
              origin: "current location", 
              destination: "{{last_step_result.result.lat}},{{last_step_result.result.lon}}" 
            },
            requires_confirmation: false,
            description: "Calculating the optimal route."
          },
          {
            tool_name: "add_calendar_event",
            parameters: { 
              title: `Travel to ${location}`,
              start_time: dateStr,
              end_time: endDateStr,
              location: "{{last_step_result.result.destination}}"
            },
            requires_confirmation: false,
            description: "Securing your passage."
          }
        ]
      };
    }
  },
  CONCERT_NIGHT: {
    trigger: (c, input) => input.toLowerCase().includes("concert") || input.toLowerCase().includes("show"),
    generateSteps: (c, input, { lat, lon, cuisine, dateStr, endDateStr }) => {
      return {
        intent_type: "concert_night",
        constraints: ["Event-centric dining", "Proximity bias"],
        ordered_steps: [
          {
            tool_name: "find_event",
            parameters: { query: "concert", lat, lon, date: dateStr },
            requires_confirmation: false,
            description: "Finding the perfect show."
          },
          {
            tool_name: "search_restaurant",
            parameters: { 
              cuisine, 
              lat: "{{last_step_result.result[0].lat}}", 
              lon: "{{last_step_result.result[0].lon}}",
              romantic: true 
            },
            requires_confirmation: false,
            description: "Finding a nearby restaurant for dinner."
          },
          {
            tool_name: "add_calendar_event",
            parameters: { 
              title: "Concert Night",
              start_time: dateStr,
              end_time: endDateStr,
              location: "{{last_step_result.result[0].name}}"
            },
            requires_confirmation: true,
            description: "Finalizing your evening plans."
          }
        ]
      };
    }
  },
  WEATHER_CHECK: {
    trigger: (c, input) => input.toLowerCase().includes("weather") || input.toLowerCase().includes("forecast"),
    generateSteps: (c, input, { lat, lon, dateStr }) => {
      const location = c.metadata?.location || "London";
      return {
        intent_type: "weather_check",
        constraints: ["Real-time meteorological data"],
        ordered_steps: [
          {
            tool_name: "geocode_location",
            parameters: { location },
            requires_confirmation: false,
            description: `Locating ${location} for weather report.`
          },
          {
            tool_name: "get_weather_forecast",
            parameters: { 
              location: "{{last_step_result.result.lat}},{{last_step_result.result.lon}}",
              date: dateStr 
            },
            requires_confirmation: false,
            description: "Fetching the forecast."
          }
        ]
      };
    }
  },
  DINING: {
    trigger: (c) => c.type === "TOOL_SEARCH",
    generateSteps: (c, input, { lat, lon, cuisine }) => ({
      intent_type: "dining",
      constraints: ["find restaurant", `near ${lat}, ${lon}`],
      ordered_steps: [
        {
          tool_name: "search_restaurant",
          parameters: { 
            cuisine,
            lat,
            lon,
            romantic: c.isSpecialIntent
          },
          requires_confirmation: false,
          description: "Finding the perfect venue for you."
        }
      ]
    })
  },
  COMPLEX_PLAN: {
    trigger: (c) => c.type === "TOOL_CALENDAR" || c.type === "COMPLEX_PLAN",
    generateSteps: (c, input, { lat, lon, cuisine, dateStr, endDateStr }) => {
      const steps = [];
      const normalized = input.toLowerCase();
      
      if (c.type === "COMPLEX_PLAN" || normalized.includes("restaurant") || normalized.includes("dinner") || normalized.includes("lunch")) {
        steps.push({
          tool_name: "search_restaurant",
          parameters: { 
            cuisine,
            lat,
            lon,
            romantic: c.isSpecialIntent
          },
          requires_confirmation: false,
          description: "Finding the perfect venue for you."
        });
      }

      if (c.metadata?.isDateNight) {
        steps.push({
          tool_name: "find_event",
          parameters: { query: "movie", lat, lon },
          requires_confirmation: false,
          description: "Finding a cinematic escape."
        });
      }

      steps.push({
        tool_name: "add_calendar_event",
        parameters: { 
          title: c.metadata?.isDateNight ? "Date Night" : (c.isSpecialIntent ? "Special Occasion" : "Event"),
          start_time: dateStr,
          end_time: endDateStr,
          location: "" 
        },
        requires_confirmation: true,
        description: "Preparing your calendar for the final act."
      });

      return {
        intent_type: c.type === "COMPLEX_PLAN" ? "dining_and_calendar" : "scheduling",
        constraints: ["deterministic orchestration", "2-hour duration"],
        ordered_steps: steps
      };
    }
  }
};

/**
 * Deterministically generates the muscle of the plan (ordered_steps).
 * The LLM will later provide the summary (the whisper).
 */
export function getDeterministicPlan(
  classification: IntentClassification,
  input: string,
  userLocation?: { lat: number; lng: number } | null,
  dnaCuisine?: string,
  sessionContext?: any
): Partial<Plan> {
  const normalized = input.toLowerCase();
  const lat = userLocation?.lat || 51.5074;
  const lon = userLocation?.lng || -0.1278;

  const parsedDate = chrono.parseDate(input) || new Date();
  let startTime = parsedDate;
  
  if (classification.metadata?.isTransport) {
    startTime = new Date(parsedDate.getTime() - 2 * 60 * 60 * 1000);
  }

  const dateStr = startTime.toISOString();
  const endDate = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);
  const endDateStr = endDate.toISOString();

  const CUISINE_LIST = ['italian', 'french', 'japanese', 'chinese', 'mexican', 'indian', 'spanish', 'thai', 'sushi', 'pizza', 'steak', 'seafood', 'burger', 'tapas', 'bistro', 'wine shop'];
  let cuisineMatch = CUISINE_LIST.find(c => normalized.includes(c));
  const isVague = VAGUE_PHRASES.some(phrase => normalized.includes(phrase)) || 
                  (normalized.includes("wine") || normalized.includes("drink") || normalized.includes("bar"));
  
  if (isVague && (normalized.includes("wine") || normalized.includes("drink") || normalized.includes("bar")) && sessionContext?.cuisine === 'french') {
    cuisineMatch = 'wine shop';
  }

  const cuisine = cuisineMatch || (isVague && (sessionContext?.cuisine || dnaCuisine) ? (sessionContext?.cuisine || dnaCuisine) : "any");

  const context = { lat, lon, cuisine, dateStr, endDateStr };

  // Iterate through registry to find matching intent
  for (const entry of Object.values(PLAN_REGISTRY)) {
    if (entry.trigger(classification, input)) {
      return entry.generateSteps(classification, input, context);
    }
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
export async function classifyIntent(input: string, sessionContext?: any): Promise<IntentClassification> {
  const normalized = input.toLowerCase().trim().replace(/[.,!?;:]/g, '');

  // Check for weekend getaway
  if (normalized.includes("weekend trip") || normalized.includes("getaway") || normalized.includes("escape")) {
    return {
      type: "COMPLEX_PLAN",
      confidence: 0.95,
      reason: "Weekend getaway intent detected",
      isSpecialIntent: true,
      metadata: { isWeekendGetaway: true }
    };
  }

  // Check for date night
  if (normalized.includes("date night") || normalized.includes("evening out")) {
    return {
      type: "COMPLEX_PLAN",
      confidence: 0.95,
      reason: "Date night intent detected",
      isSpecialIntent: true,
      metadata: { isDateNight: true }
    };
  }

  // Check for vague requests with session context bias
  const isVagueRequest = VAGUE_PHRASES.some(phrase => normalized.includes(phrase)) || 
                         (sessionContext && (normalized.includes("wine") || normalized.includes("drink") || normalized.includes("bar")));

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
      isSpecialIntent: true
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

    const SIMPLE_KEYWORDS = ['hi', 'hello', 'hey', 'greetings', 'yo', 'morning', 'afternoon', 'evening', 'thanks', 'thank you', 'thx', 'ty', 'much appreciated', 'ok', 'okay', 'cool', 'got it', 'sure', 'yes', 'no', 'bye', 'goodbye', 'help', 'time', 'date', 'who', 'what', 'how'];

    

    let simpleScore = 0;

    words.forEach(word => {

      if (SIMPLE_KEYWORDS.includes(word)) simpleScore++;

    });

  

    if (simpleScore > 0) {

      return {

        type: "SIMPLE",

        confidence: 0.95,

        reason: "Matched common simple intent keywords"

      };

    }

  

    // If it's very short but didn't match anything else, it's still likely simple

    if (normalized.length < 5) {

      return {

        type: "SIMPLE",

        confidence: 0.9,

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

  