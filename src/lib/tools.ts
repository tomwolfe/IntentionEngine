import { RestaurantResultSchema } from "./schema";
import { cache, CACHE_TTLS } from "./cache";
import { GeocodeLocationSchema, SearchRestaurantSchema, AddCalendarEventSchema } from "./validation-schemas";
import { withCircuitBreaker } from "./reliability";
import { withRetry } from "./utils/reliability";

async function fetchWithRetry(url: string, options: RequestInit, service: string): Promise<Response> {
  return await withCircuitBreaker(service, async () => {
    return await withRetry(async () => {
      const response = await fetch(url, options);
      if (!response.ok) {
        const error = new Error(`API error: ${response.statusText}`);
        (error as any).status = response.status;
        throw error;
      }
      return response;
    }, 3, 1000, 10000);
  });
}

export async function geocode_location(params: any) {
  const validated = GeocodeLocationSchema.safeParse(params);
  if (!validated.success) {
    return { success: false, error: "Invalid parameters", details: validated.error.format() };
  }
  const { location } = validated.data;

  console.log(`Geocoding location: ${location}...`);
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
    const response = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'IntentionEngine/1.0' }
    }, 'nominatim');
    
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

export async function search_restaurant(params: any) {
  const validatedInput = SearchRestaurantSchema.safeParse(params);
  if (!validatedInput.success) {
    return { success: false, error: "Invalid parameters", details: validatedInput.error.format() };
  }
  
  let { cuisine, lat, lon, location, romantic } = validatedInput.data;
  
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

  const cacheKey = `restaurant:${cuisine || 'any'}:${lat.toFixed(2)}:${lon.toFixed(2)}:${romantic ? 'romantic' : 'all'}`;

  const cached = await cache.get(cacheKey);
  if (cached) {
    console.log(`Using cached results for ${cacheKey}`);
    return {
      success: true,
      result: cached
    };
  }

  console.log(`Searching for ${cuisine || 'restaurants'} near ${lat}, ${lon}... ${romantic ? '(Romantic prioritized)' : ''}`);

  try {
    let query = cuisine 
      ? `
        [out:json][timeout:10];
        (
          nwr["amenity"="restaurant"]["cuisine"~"${cuisine}",i](around:10000,${lat},${lon});
          nwr["amenity"="restaurant"](around:5000,${lat},${lon});
        );
        out center 15;
      `
      : `
        [out:json][timeout:10];
        nwr["amenity"="restaurant"](around:10000,${lat},${lon});
        out center 15;
      `;

    const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    
    const overpassRes = await fetchWithRetry(overpassUrl, {}, 'overpass');

    const overpassData = await overpassRes.json();
    let elements = overpassData.elements || [];

    if (romantic) {
      elements = elements.filter((el: any) => {
        const c = (el.tags?.cuisine || '').toLowerCase();
        return !c.includes('pizza') && !c.includes('mexican') && !c.includes('fast_food');
      });
    }

    const cuisineRegex = cuisine ? new RegExp(cuisine, 'i') : null;
    const romanticKeywords = ['romantic', 'fine dining', 'candlelight', 'intimate', 'french', 'italian', 'wine bar'];

    elements.sort((a: any, b: any) => {
      let aScore = 0;
      let bScore = 0;

      const aCuisine = (a.tags?.cuisine || '').toLowerCase();
      const bCuisine = (b.tags?.cuisine || '').toLowerCase();
      const aName = (a.tags?.name || '').toLowerCase();
      const bName = (b.tags?.name || '').toLowerCase();

      if (cuisineRegex) {
        if (cuisineRegex.test(aCuisine) || cuisineRegex.test(aName)) aScore += 10;
        if (cuisineRegex.test(bCuisine) || cuisineRegex.test(bName)) bScore += 10;
      }

      if (romantic) {
        romanticKeywords.forEach(kw => {
          if (aCuisine.includes(kw) || aName.includes(kw)) aScore += 5;
          if (bCuisine.includes(kw) || bName.includes(kw)) bScore += 5;
        });
        if (aCuisine.includes('french') || aCuisine.includes('italian')) aScore += 3;
        if (bCuisine.includes('french') || bCuisine.includes('italian')) bScore += 3;
      }

      return bScore - aScore;
    });

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

    if (results.length > 0) {
      await cache.set(cacheKey, results, CACHE_TTLS.RESTAURANTS);
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

export async function add_calendar_event(params: any) {
  const validated = AddCalendarEventSchema.safeParse(params);
  if (!validated.success) {
    return { success: false, error: "Invalid parameters", details: validated.error.format() };
  }
  const { title, start_time, end_time, location, restaurant_name, restaurant_address } = validated.data;

  console.log(`Adding calendar event: ${title} from ${start_time} to ${end_time}...`);
  
  const description = (restaurant_name || restaurant_address)
    ? `Restaurant: ${restaurant_name || 'N/A'}\nAddress: ${restaurant_address || 'N/A'}`
    : "";

  const queryParams = new URLSearchParams({
    title,
    start: start_time,
    end: end_time,
    location: location || restaurant_address || "",
    description
  });

  return {
    success: true,
    result: {
      status: "ready",
      download_url: `/api/download-ics?${queryParams.toString()}`
    }
  };
}

export const TOOLS: Record<string, Function> = Object.freeze({
  search_restaurant,
  add_calendar_event,
  geocode_location,
});

export async function executeTool(tool_name: string, parameters: any) {
  const tool = TOOLS[tool_name];
  if (!tool) {
    throw new Error(`Tool ${tool_name} not found`);
  }
  return await tool(parameters);
}
