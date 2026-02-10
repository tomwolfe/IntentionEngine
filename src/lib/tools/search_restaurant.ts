import { z } from "zod";
import { Tool, ToolResult } from "./types";
import { getGeocodingProvider, getSearchProvider } from "../providers";
import { Redis } from "@upstash/redis";
import { env } from "../config";
import { lruCache } from "../cache";

const redis = (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

const SearchRestaurantParams = z.object({
  cuisine: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  location: z.string().optional(),
});

type Params = z.infer<typeof SearchRestaurantParams>;

export const searchRestaurantTool: Tool<Params> = {
  definition: {
    name: "search_restaurant",
    description: "Searches for restaurants based on cuisine, location or coordinates. If coordinates are not provided, 'location' string will be used to geocode.",
    parameters: SearchRestaurantParams,
    requires_confirmation: false,
  },
  execute: async (params: Params): Promise<ToolResult> => {
    let { cuisine, lat, lon, location } = params;
    
    if ((lat === undefined || lon === undefined) && location) {
      const geocoder = getGeocodingProvider();
      const geo = await geocoder.geocode(location);
      if (geo) {
        lat = geo.lat;
        lon = geo.lon;
      } else {
        return { success: false, error: "Could not geocode location and no coordinates provided." };
      }
    }

    if (lat === undefined || lon === undefined) {
      return { success: false, error: "Coordinates are required for restaurant search." };
    }

    const cacheKey = `restaurant:${cuisine || 'any'}:${lat.toFixed(3)}:${lon.toFixed(3)}`;

    // Try Redis first
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return { success: true, result: cached };
        }
      } catch (err) {
        console.warn("Redis cache read failed:", err);
      }
    }

    // Try LRU fallback
    const localCached = lruCache.get(cacheKey);
    if (localCached) {
      return { success: true, result: localCached };
    }

    try {
      const searcher = getSearchProvider();
      const results = await searcher.search({ cuisine, lat, lon });

      const finalResults = results.slice(0, 5);

      if (redis && finalResults.length > 0) {
        try {
          await redis.setex(cacheKey, 3600, finalResults);
        } catch (err) {
          console.warn("Redis cache write failed:", err);
        }
      }

      lruCache.set(cacheKey, finalResults, 3600);

      return { success: true, result: finalResults };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
};
