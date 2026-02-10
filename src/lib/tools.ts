import { RestaurantResultSchema } from "./schema";
import { Redis } from "@upstash/redis";
import { env } from "./config";
import { z } from "zod";

const redis = (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const GeocodeSchema = z.object({
  location: z.string().min(1).describe("The city, neighborhood, or specific place name to geocode. Use 'nearby' for the user's current area."),
  userLocation: z.object({
    lat: z.number().describe("User's current latitude"),
    lng: z.number().describe("User's current longitude")
  }).optional().describe("The user's current GPS coordinates for biasing search results.")
});

export async function geocode_location(params: z.infer<typeof GeocodeSchema>) {
  const validated = GeocodeSchema.safeParse(params);
  if (!validated.success) return { success: false, error: "Invalid parameters" };
  const { location, userLocation } = validated.data;

  // Vague location handling
  const vagueTerms = ["nearby", "near me", "around here", "here", "current location"];
  if (vagueTerms.includes(location.toLowerCase()) && userLocation) {
    console.log("Vague location detected, using userLocation bias.");
    return {
      success: true,
      result: {
        lat: userLocation.lat,
        lon: userLocation.lng
      }
    };
  }

  console.log(`Geocoding location: ${location}...`);
  try {
    // Bias the search with userLocation if available using viewbox or context
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
    
    if (userLocation) {
      // Use a viewbox around the user's location (approx 0.5 degrees ~ 50km) for biasing
      const boxSize = 0.5;
      const viewbox = `${userLocation.lng - boxSize},${userLocation.lat + boxSize},${userLocation.lng + boxSize},${userLocation.lat - boxSize}`;
      url += `&viewbox=${viewbox}&bounded=0`; // bounded=0 means bias, bounded=1 means strict limit
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'IntentionEngine/1.0'
      }
    });
    const data = await response.json();
    if (data && data.length > 0) {
      return {
        success: true,
        result: {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon)
        }
      };
    }
    return { success: false, error: "Location not found" };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

const SearchRestaurantSchema = z.object({
  cuisine: z.string().optional().describe("The type of cuisine to search for (e.g., 'Italian', 'Sushi', 'Burgers')."),
  lat: z.number().optional().describe("Latitude for the search center."),
  lon: z.number().optional().describe("Longitude for the search center."),
  location: z.string().optional().describe("A text-based location (e.g., 'Soho, London') to search near if coordinates are not provided."),
  userLocation: z.object({
    lat: z.number().describe("User's current latitude"),
    lng: z.number().describe("User's current longitude")
  }).optional().describe("The user's current GPS coordinates for proximity biasing.")
});

export async function search_restaurant(params: z.infer<typeof SearchRestaurantSchema>) {
  const validated = SearchRestaurantSchema.safeParse(params);
  if (!validated.success) return { success: false, error: "Invalid parameters" };
  let { cuisine, lat, lon, location, userLocation } = validated.data;
  
  if ((lat === undefined || lon === undefined) && (location || userLocation)) {
    // If we have a location string, or just userLocation and no lat/lon
    const geo = await geocode_location({ 
      location: location || "nearby", 
      userLocation 
    });
    if (geo.success && geo.result) {
      lat = geo.result.lat;
      lon = geo.result.lon;
    } else if (!location && userLocation) {
        lat = userLocation.lat;
        lon = userLocation.lng;
    } else {
      return { success: false, error: "Could not geocode location and no coordinates provided." };
    }
  }

  if (lat === undefined || lon === undefined) {
    return { success: false, error: "Coordinates are required for restaurant search." };
  }

  // Cache key based on cuisine and rounded coordinates (approx 100m precision)
  const cacheKey = `restaurant:${cuisine || 'any'}:${lat.toFixed(3)}:${lon.toFixed(3)}`;

  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`Using cached results for ${cacheKey}`);
        return {
          success: true,
          result: cached
        };
      }
    } catch (err) {
      console.warn("Redis cache read failed:", err);
    }
  }

  console.log(`Searching for ${cuisine || 'restaurants'} near ${lat}, ${lon}...`);

  try {
    // 2. Overpass Query
    const query = cuisine 
      ? `
        [out:json][timeout:10];
        (
          nwr["amenity"="restaurant"]["cuisine"~"${cuisine}",i](around:10000,${lat},${lon});
          nwr["amenity"="restaurant"](around:5000,${lat},${lon});
        );
        out center 10;
      `
      : `
        [out:json][timeout:10];
        nwr["amenity"="restaurant"](around:10000,${lat},${lon});
        out center 10;
      `;

    const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const overpassRes = await fetch(overpassUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!overpassRes.ok) {
      throw new Error(`Overpass API error: ${overpassRes.statusText}`);
    }

    const overpassData = await overpassRes.json();
    let elements = overpassData.elements || [];

    // Prioritize results that match the cuisine if provided
    if (cuisine) {
      const regex = new RegExp(cuisine, 'i');
      elements.sort((a: any, b: any) => {
        const aCuisine = a.tags?.cuisine || '';
        const bCuisine = b.tags?.cuisine || '';
        const aMatches = regex.test(aCuisine);
        const bMatches = regex.test(bCuisine);
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
        return 0;
      });
    }

    const results = elements.map((el: any) => {
      const name = el.tags.name || "Unknown Restaurant";
      const addr = [
        el.tags["addr:housenumber"],
        el.tags["addr:street"],
        el.tags["addr:city"]
      ].filter(Boolean).join(" ") || "Address not available";

      const rawResult = {
        name,
        address: addr,
        coordinates: {
          lat: parseFloat(el.lat || el.center?.lat),
          lon: parseFloat(el.lon || el.center?.lon)
        }
      };

      const validated = RestaurantResultSchema.safeParse(rawResult);
      return validated.success ? validated.data : null;
    }).filter(Boolean).slice(0, 5); // Limit to top 5

    if (redis && results.length > 0) {
      try {
        await redis.setex(cacheKey, 3600, results);
      } catch (err) {
        console.warn("Redis cache write failed:", err);
      }
    }

    return {
      success: true,
      result: results
    };
  } catch (error: any) {
    console.error("Error in search_restaurant:", error);
    return { success: false, error: error.message };
  }
}

const EventItemSchema = z.object({
  title: z.string().min(1).describe("The name or title of the calendar event (e.g., 'Dinner at Nobu')."),
  start_time: z.string().describe("The start date and time. Use ISO 8601 format (e.g., '2026-02-10T19:00:00Z')."),
  end_time: z.string().describe("The end date and time. Use ISO 8601 format (e.g., '2026-02-10T21:00:00Z')."),
  location: z.string().optional().describe("Physical address or venue name for the event."),
  restaurant_name: z.string().optional().describe("If the event is at a restaurant, its name."),
  restaurant_address: z.string().optional().describe("If the event is at a restaurant, its full address.")
});

const AddCalendarEventSchema = z.object({
  events: z.array(EventItemSchema).min(1).describe("An array of one or more calendar events to schedule.")
});

export async function add_calendar_event(params: z.infer<typeof AddCalendarEventSchema>) {
  const validated = AddCalendarEventSchema.safeParse(params);
  if (!validated.success) {
    // Fallback for single event if passed directly (for backward compatibility if needed, though we should adhere to schema)
    const singleEvent = EventItemSchema.safeParse(params);
    if (singleEvent.success) {
      params = { events: [singleEvent.data] };
    } else {
      return { success: false, error: "Invalid parameters. Expected an array of events." };
    }
  } else {
    params = validated.data;
  }

  const { events } = params;
  
  console.log(`Adding ${events.length} calendar event(s)...`);
  
  const serializedEvents = JSON.stringify(events.map(e => ({
    title: e.title,
    start: e.start_time,
    end: e.end_time,
    location: e.location || e.restaurant_address || "",
    description: (e.restaurant_name || e.restaurant_address)
      ? `Restaurant: ${e.restaurant_name || 'N/A'}\nAddress: ${e.restaurant_address || 'N/A'}`
      : ""
  })));

  return {
    success: true,
    result: {
      status: "ready",
      count: events.length,
      download_url: `/api/download-ics?events=${encodeURIComponent(serializedEvents)}`,
      events: events.map(e => ({
        title: e.title,
        start_time: e.start_time,
        end_time: e.end_time,
        location: e.location || e.restaurant_address || "",
      }))
    }
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodObject<any>;
  execute: (params: any) => Promise<{ success: boolean; result?: any; error?: string }>;
}

export type ExecuteToolResult = {
  success: boolean;
  result?: any;
  error?: string;
  replanned?: boolean;
  new_plan?: any;
  error_explanation?: string;
};

export const TOOLS: Map<string, ToolDefinition> = new Map([
  ["geocode_location", {
    name: "geocode_location",
    description: "Converts a city or place name to lat/lon coordinates.",
    parameters: GeocodeSchema,
    execute: geocode_location
  }],
  ["search_restaurant", {
    name: "search_restaurant",
    description: "Searches for highly-rated restaurants nearby or in a specific location.",
    parameters: SearchRestaurantSchema,
    execute: search_restaurant
  }],
  ["add_calendar_event", {
    name: "add_calendar_event",
    description: "Adds an event to the calendar. Can accept multiple events for bulk scheduling.",
    parameters: AddCalendarEventSchema,
    execute: add_calendar_event
  }]
]);

export async function executeTool(
  tool_name: string, 
  parameters: any, 
  context?: { audit_log_id: string; step_index: number }
): Promise<ExecuteToolResult> {
  const toolDef = TOOLS.get(tool_name);
  if (!toolDef) {
    throw new Error(`Tool ${tool_name} not found`);
  }

  const startTime = Date.now();
  let result: any;
  let attempts = 0;
  const maxRetries = 3;

  while (attempts < maxRetries) {
    try {
      result = await toolDef.execute(parameters);
      
      // Technical vs Logical error detection
      const technicalErrorKeywords = ["429", "network", "timeout", "fetch", "socket", "hang up", "overpass api error"];
      const isTechnicalError = !result.success && result.error && technicalErrorKeywords.some(k => result.error.toLowerCase().includes(k));

      if (isTechnicalError && attempts < maxRetries - 1) {
        throw new Error(result.error); // Trigger retry
      }
      
      break; 
    } catch (error: any) {
      attempts++;
      const errorMessage = error.message?.toLowerCase() || "";
      const isRetryable = errorMessage.includes('429') || 
                          errorMessage.includes('network') || 
                          errorMessage.includes('timeout') || 
                          errorMessage.includes('fetch') ||
                          errorMessage.includes('overpass api error');
      
      if (isRetryable && attempts < maxRetries) {
        const delay = Math.pow(2, attempts) * 1000;
        console.warn(`Technical error in ${tool_name}, retrying in ${delay}ms... (Attempt ${attempts}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      result = { success: false, error: error.message || "Unknown error" };
      break;
    }
  }

  const duration = Date.now() - startTime;

  if (context) {
    const { getAuditLog, updateAuditLog } = await import("./audit");
    const log = await getAuditLog(context.audit_log_id);
    if (log) {
      const toolExecutionLatencies = log.toolExecutionLatencies || { latencies: {}, totalToolExecutionTime: 0 };
      const latencies = toolExecutionLatencies.latencies[tool_name] || [];
      latencies.push(duration);
      toolExecutionLatencies.latencies[tool_name] = latencies;
      toolExecutionLatencies.totalToolExecutionTime = (toolExecutionLatencies.totalToolExecutionTime || 0) + duration;

      const newStep = {
        step_index: context.step_index,
        tool_name,
        status: (result.success ? "executed" : "failed") as any,
        input: parameters,
        output: result.result,
        error: result.error,
        timestamp: new Date().toISOString(),
        latency: duration // Added latency to step
      };

      const updatedSteps = [...log.steps, newStep];

      await updateAuditLog(context.audit_log_id, { 
        toolExecutionLatencies,
        steps: updatedSteps
      });

      if (result.success === false) {
        console.log(`Tool ${tool_name} returned success: false, triggering re-plan...`);
        const { replan } = await import("./llm");

        if (log.plan) {
          try {
            const errorExplanation = `Step ${context.step_index} (${tool_name}) failed: ${result.error || "Unknown error"}`;
            console.log(`Re-planning with explanation: ${errorExplanation}`);
            
            // Step 1: Pass entire context (parameters + result)
            const newPlan = await replan(
              log.intent, 
              { ...log, steps: updatedSteps }, 
              context.step_index, 
              result.error || "Tool returned failure",
              { parameters, result }
            );
            
            await updateAuditLog(context.audit_log_id, {
              plan: newPlan,
              final_outcome: `Re-planned due to failure in ${tool_name}. ${errorExplanation}`
            });

            return {
              ...result,
              replanned: true,
              new_plan: newPlan,
              error_explanation: errorExplanation
            };
          } catch (replanError: any) {
            console.error("Re-planning failed after tool failure:", replanError);
          }
        }
      }
    }
  }

  return result;
}

