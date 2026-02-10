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
  location: z.string().min(1)
});

export async function geocode_location(params: z.infer<typeof GeocodeSchema>) {
  const validated = GeocodeSchema.safeParse(params);
  if (!validated.success) return { success: false, error: "Invalid parameters" };
  const { location } = validated.data;

  console.log(`Geocoding location: ${location}...`);
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
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
  cuisine: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  location: z.string().optional()
});

export async function search_restaurant(params: z.infer<typeof SearchRestaurantSchema>) {
  const validated = SearchRestaurantSchema.safeParse(params);
  if (!validated.success) return { success: false, error: "Invalid parameters" };
  let { cuisine, lat, lon, location } = validated.data;
  
  if ((lat === undefined || lon === undefined) && location) {
    const geo = await geocode_location({ location });
    if (geo.success && geo.result) {
      lat = geo.result.lat;
      lon = geo.result.lon;
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

const AddCalendarEventSchema = z.object({
  title: z.string().min(1),
  start_time: z.string(),
  end_time: z.string(),
  location: z.string().optional(),
  restaurant_name: z.string().optional(),
  restaurant_address: z.string().optional()
});

export async function add_calendar_event(params: z.infer<typeof AddCalendarEventSchema>) {
  const validated = AddCalendarEventSchema.safeParse(params);
  if (!validated.success) return { success: false, error: "Invalid parameters" };
  const data = validated.data;
  
  console.log(`Adding calendar event: ${data.title} from ${data.start_time} to ${data.end_time}...`);
  
  const description = (data.restaurant_name || data.restaurant_address)
    ? `Restaurant: ${data.restaurant_name || 'N/A'}\nAddress: ${data.restaurant_address || 'N/A'}`
    : "";

  const queryParams = new URLSearchParams({
    title: data.title,
    start: data.start_time,
    end: data.end_time,
    location: data.location || data.restaurant_address || "",
    description: description
  });

  return {
    success: true,
    result: {
      status: "ready",
      download_url: `/api/download-ics?${queryParams.toString()}`,
      event_details: {
        title: data.title,
        start_time: data.start_time,
        end_time: data.end_time,
        location: data.location || data.restaurant_address || "",
      }
    }
  };
}

export const TOOLS: Record<string, Function> = {
  search_restaurant,
  add_calendar_event,
  geocode_location,
};

export async function executeTool(tool_name: string, parameters: any) {
  const tool = TOOLS[tool_name];
  if (!tool) {
    throw new Error(`Tool ${tool_name} not found`);
  }
  return await tool(parameters);
}
