import { RestaurantResultSchema } from "../schema";
import { Redis } from "@upstash/redis";
import { env } from "../config";

const redis = (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 1000,
  backoff = 2
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * backoff, backoff);
  }
}

export async function geocode_location(params: { location: string }) {
  console.log(`Geocoding location: ${params.location}...`);
  try {
    const result = await withRetry(async () => {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(params.location)}&format=json&limit=1`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'IntentionEngine/1.0'
        }
      });
      if (!response.ok) throw new Error(`Geocoding API error: ${response.statusText}`);
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
    });
    return result;
  } catch (error: any) {
    return { success: false, error: `Geocoding failed after retries: ${error.message}` };
  }
}

export async function search_restaurant(params: { cuisine?: string; lat?: number; lon?: number; location?: string }) {
  let { cuisine, lat, lon, location } = params;
  
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
    const results = await withRetry(async () => {
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
      }).filter(Boolean).slice(0, 5);

      return results;
    });

    if (redis && results && (results as any[]).length > 0) {
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
    return { success: false, error: `Restaurant search failed after retries: ${error.message}` };
  }
}

export async function add_calendar_event(params: { 
  title: string; 
  start_time: string; 
  end_time: string; 
  location?: string;
  restaurant_name?: string;
  restaurant_address?: string;
}) {
  console.log(`Adding calendar event: ${params.title} from ${params.start_time} to ${params.end_time}...`);
  
  const description = (params.restaurant_name || params.restaurant_address)
    ? `Restaurant: ${params.restaurant_name || 'N/A'}\nAddress: ${params.restaurant_address || 'N/A'}`
    : "";

  const queryParams = new URLSearchParams({
    title: params.title,
    start: params.start_time,
    end: params.end_time,
    location: params.location || params.restaurant_address || "",
    description: description
  });

  return {
    success: true,
    result: {
      status: "ready",
      download_url: `/api/download-ics?${queryParams.toString()}`
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
