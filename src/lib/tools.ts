import { RestaurantResultSchema } from "./schema";
import { redis } from "./cache";

export async function geocode_location(params: { location: string }) {
  console.log(`Geocoding location: ${params.location}...`);
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(params.location)}&format=json&limit=1`;
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

export async function search_restaurant(params: { cuisine?: string; lat?: number; lon?: number; location?: string; romantic?: boolean }) {
  let { cuisine, lat, lon, location, romantic } = params;
  
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

  // Redis cache key: restaurant:{cuisine || 'any'}:{lat.2f}:{lon.2f}:{romantic ? 'romantic' : 'all'}
  // TTL: 3600 seconds (1 hour)
  const cacheKey = `restaurant:${cuisine || 'any'}:${lat.toFixed(2)}:${lon.toFixed(2)}:${romantic ? 'romantic' : 'all'}`;

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

  console.log(`Searching for ${cuisine || 'restaurants'} near ${lat}, ${lon}... ${romantic ? '(Romantic prioritized)' : ''}`);

  try {
    // 2. Overpass Query
    // If romantic is true, we add a filter for potential romantic features or just use it in sorting.
    // Overpass doesn't have a great "romantic" tag, so we'll rely on cuisine and sorting.
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
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // Increased timeout for larger query

    const overpassRes = await fetch(overpassUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!overpassRes.ok) {
      throw new Error(`Overpass API error: ${overpassRes.statusText}`);
    }

    const overpassData = await overpassRes.json();
    let elements = overpassData.elements || [];

    // Filter out pizza/Mexican if romantic is requested
    if (romantic) {
      elements = elements.filter((el: any) => {
        const c = (el.tags?.cuisine || '').toLowerCase();
        return !c.includes('pizza') && !c.includes('mexican') && !c.includes('fast_food');
      });
    }

    // Prioritize results that match the cuisine or "romantic" keywords
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
        
        // Bonus for French/Italian in romantic contexts
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
