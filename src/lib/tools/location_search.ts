import { z } from "zod";
import { RestaurantResultSchema } from "../schema";
import { Redis } from "@upstash/redis";
import { env } from "../config";

const redis = (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

export const GeocodeSchema = z.object({
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

export const SearchRestaurantSchema = z.object({
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
    // 2. Overpass Query - STRICT cuisine filtering if provided
    const query = cuisine 
      ? `
        [out:json][timeout:10];
        nwr["amenity"="restaurant"]["cuisine"~"${cuisine}",i](around:10000,${lat},${lon});
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

    // Mandatory strict-match filter for the cuisine parameter
    if (cuisine) {
      const regex = new RegExp(cuisine, 'i');
      elements = elements.filter((el: any) => {
        const elCuisine = el.tags?.cuisine || '';
        // Check if any of the cuisines match (cuisine tag can be a semi-colon separated list)
        return elCuisine.split(';').some((c: string) => regex.test(c.trim()));
      });
    }

    const results = elements.map((el: any) => {
      const name = el.tags.name || "Unknown Restaurant";
      const addr = [
        el.tags["addr:housenumber"],
        el.tags["addr:street"],
        el.tags["addr:city"]
      ].filter(Boolean).join(" ") || "Address not available";

      const elCuisine = el.tags?.cuisine 
        ? el.tags.cuisine.split(';').map((c: string) => c.trim())
        : [];

      const rawResult = {
        name,
        address: addr,
        cuisine: elCuisine,
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
