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
    return {
      success: true,
      result: {
        lat: userLocation.lat,
        lon: userLocation.lng
      }
    };
  }

  try {
    let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
    
    if (userLocation) {
      const boxSize = 0.5;
      const viewbox = `${userLocation.lng - boxSize},${userLocation.lat + boxSize},${userLocation.lng + boxSize},${userLocation.lat - boxSize}`;
      url += `&viewbox=${viewbox}&bounded=0`;
    }

    const response = await fetch(url, {
      headers: { 'User-Agent': 'IntentionEngine/1.0' }
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
    const geo = await geocode_location({ location: location || "nearby", userLocation });
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

  if (lat === undefined || lon === undefined) return { success: false, error: "Coordinates required." };

  const cacheKey = `restaurant:${cuisine || 'any'}:${lat.toFixed(3)}:${lon.toFixed(3)}`;

  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return { success: true, result: cached };
    } catch (err) {
      console.warn("Redis cache read failed:", err);
    }
  }

  try {
    const query = cuisine 
      ? `[out:json][timeout:10];(nwr["amenity"="restaurant"]["cuisine"~"${cuisine}",i](around:10000,${lat},${lon});nwr["amenity"="restaurant"](around:5000,${lat},${lon}););out center 10;`
      : `[out:json][timeout:10];nwr["amenity"="restaurant"](around:10000,${lat},${lon});out center 10;`;

    const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    const overpassRes = await fetch(overpassUrl);
    if (!overpassRes.ok) throw new Error(`Overpass API error: ${overpassRes.statusText}`);

    const overpassData = await overpassRes.json();
    let elements = overpassData.elements || [];

    const results = elements.map((el: any) => ({
      name: el.tags.name || "Unknown Restaurant",
      address: [el.tags["addr:housenumber"], el.tags["addr:street"], el.tags["addr:city"]].filter(Boolean).join(" ") || "Address not available",
      coordinates: {
        lat: parseFloat(el.lat || el.center?.lat),
        lon: parseFloat(el.lon || el.center?.lon)
      }
    })).slice(0, 5);

    if (redis && results.length > 0) {
      try {
        await redis.setex(cacheKey, 3600, results);
      } catch (err) {
        console.warn("Redis cache write failed:", err);
      }
    }

    return { success: true, result: results };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

const AddCalendarEventSchema = z.object({
  events: z.array(z.object({
    title: z.string().min(1),
    start_time: z.string(),
    end_time: z.string(),
    location: z.string().optional(),
    restaurant_name: z.string().optional(),
    restaurant_address: z.string().optional()
  })).min(1)
});

export async function add_calendar_event(params: z.infer<typeof AddCalendarEventSchema>) {
  const validated = AddCalendarEventSchema.safeParse(params);
  if (!validated.success) return { success: false, error: "Invalid parameters." };

  const { events } = validated.data;
  const serializedEvents = JSON.stringify(events.map(e => ({
    title: e.title,
    start: e.start_time,
    end: e.end_time,
    location: e.location || e.restaurant_address || "",
    description: (e.restaurant_name || e.restaurant_address) ? `Restaurant: ${e.restaurant_name}\nAddress: ${e.restaurant_address}` : ""
  })));

  return {
    success: true,
    result: {
      status: "ready",
      count: events.length,
      download_url: `/api/download-ics?events=${encodeURIComponent(serializedEvents)}`,
      events
    }
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodType<any>;
  execute: (params: any) => Promise<any>;
}

export class Registry {
  private static instance: Registry;
  private tools: Map<string, ToolDefinition> = new Map();

  private constructor() {}

  public static getInstance(): Registry {
    if (!Registry.instance) {
      Registry.instance = new Registry();
    }
    return Registry.instance;
  }

  public register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  public async registerDynamic(openApiUrl: string) {
    // Placeholder for Pillar 3.2: Dynamic registration logic
    console.log(`Dynamic registration from ${openApiUrl} requested.`);
    // In a real implementation, we would fetch the OpenAPI spec, 
    // parse it, and generate ToolDefinitions.
  }

  public getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }
}

export const registry = Registry.getInstance();

registry.register({
  name: "geocode_location",
  description: "Converts a city or place name to lat/lon coordinates.",
  parameters: GeocodeSchema,
  execute: geocode_location
});

registry.register({
  name: "search_restaurant",
  description: "Search for restaurants nearby based on cuisine and location.",
  parameters: SearchRestaurantSchema,
  execute: search_restaurant
});

registry.register({
  name: "add_calendar_event",
  description: "Add one or more events to the calendar.",
  parameters: AddCalendarEventSchema,
  execute: add_calendar_event
});

export type ExecuteToolResult = {
  success: boolean;
  result?: any;
  error?: string;
  replanned?: boolean;
  new_plan?: any;
  error_explanation?: string;
};


