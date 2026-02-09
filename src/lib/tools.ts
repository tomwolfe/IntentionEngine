import { RestaurantResultSchema, RestaurantResult } from "./schema";
import { cache, CACHE_TTLS } from "./cache";
import { GeocodeLocationSchema, SearchRestaurantSchema, AddCalendarEventSchema, WeatherForecastSchema } from "./validation-schemas";
import { withCircuitBreaker } from "./reliability";
import { withRetry } from "./utils/reliability";
import * as chrono from "chrono-node";

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

// Vibe Memory is now handled via the central Redis cache
export const VIBE_MEMORY_KEY = "vibe_memory:special_cuisines";
export const VIBE_PREFERENCES_KEY = "vibe_memory:user_preferences";

export async function getVibePreferences() {
  return await cache.get<Record<string, string>>(VIBE_PREFERENCES_KEY) || {
    "Sarah": "prefers dry reds, hates loud music",
    "Atmosphere": "intimate, low lighting"
  };
}

function getSuggestedWine(cuisine: string, preferences: Record<string, string>): string {
  const c = cuisine.toLowerCase();
  const p = Object.values(preferences).join(" ").toLowerCase();
  
  if (p.includes("dry red") || p.includes("cabernet") || p.includes("merlot")) {
    return "Vintage Cabernet Sauvignon";
  }
  
  if (c.includes('italian') || c.includes('pasta')) return "Pinot Noir";
  if (c.includes('french') || c.includes('steak')) return "Cabernet Sauvignon";
  if (c.includes('seafood') || c.includes('fish')) return "Chardonnay";
  if (c.includes('japanese') || c.includes('sushi')) return "Junmai Ginjo Sake";
  if (c.includes('spanish') || c.includes('tapas')) return "Tempranillo";
  return "Sparkling Rosé";
}

async function mockWineDelivery(wine: string, restaurantName: string) {
  console.log(`[MAGIC] MAGIC INITIATED: A bottle of ${wine} has been pre-ordered for delivery to ${restaurantName}.`);
  return { success: true, message: `A bottle of ${wine} has been pre-ordered for your dinner.` };
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

const WEATHER_CODES: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export async function get_weather_forecast(params: any) {
  const validated = WeatherForecastSchema.safeParse(params);
  if (!validated.success) {
    return { success: false, error: "Invalid parameters", details: validated.error.format() };
  }
  const { location, date } = validated.data;

  console.log(`Fetching weather forecast for ${location} on ${date}...`);

  try {
    // 1. Date Parsing
    const parsedDate = chrono.parseDate(date);
    if (!parsedDate) {
      return { success: false, error: `Could not parse date: ${date}` };
    }
    const isoDate = parsedDate.toISOString().split('T')[0];

    // 2. Geocoding
    const geo = await geocode_location({ location });
    if (!geo.success || !geo.result) {
      return { success: false, error: "Could not geocode location for weather" };
    }
    const { lat, lon } = geo.result;

    // 3. Weather API Call
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&start_date=${isoDate}&end_date=${isoDate}`;

    const response = await fetchWithRetry(url, {}, 'open-meteo');
    const data = await response.json();

    if (!data.daily || !data.daily.weathercode || data.daily.weathercode.length === 0) {
      return { success: false, error: "No weather data found for the requested date" };
    }

    const weathercode = data.daily.weathercode[0];
    const condition = WEATHER_CODES[weathercode] || "Unknown";
    
    return {
      success: true,
      result: {
        condition,
        temperature_high: data.daily.temperature_2m_max[0],
        temperature_low: data.daily.temperature_2m_min[0],
        precipitation_probability: data.daily.precipitation_probability_max[0] / 100, // as decimal
        date: isoDate
      }
    };
  } catch (error: any) {
    console.error("Error in get_weather_forecast:", error);
    return { success: false, error: error.message };
  }
}

export async function search_restaurant(params: any) {
  const validatedInput = SearchRestaurantSchema.safeParse(params);
  if (!validatedInput.success) {
    return { success: false, error: "Invalid parameters", details: validatedInput.error.format() };
  }
  
  let { cuisine, lat, lon, location, romantic } = validatedInput.data;
  const isSpecialIntent = (params as any).isSpecialIntent;
  const preferences = await getVibePreferences();
  const prefValues = Object.values(preferences).join(" ").toLowerCase();

  if (isSpecialIntent) {
    romantic = true;
  }

  // Vibe Memory Bias: If it's a special/romantic request and cuisine is generic or missing, use memory
  const GENERIC_CUISINES = ['dinner', 'lunch', 'breakfast', 'food', 'eat', 'restaurant', 'meal', 'any'];
  
  if (romantic) {
    const cuisineLower = (cuisine || '').toLowerCase().trim();
    const isGeneric = !cuisine || GENERIC_CUISINES.includes(cuisineLower);
    
    if (isGeneric) {
      const history = await cache.get<string[]>(VIBE_MEMORY_KEY) || [];
      const originalCuisine = cuisine;
      if (history.length > 0) {
        cuisine = history[0];
        console.log(`Vibe Memory Bias: Overriding generic '${originalCuisine || 'undefined'}' with '${cuisine}' from memory`);
      } else {
        cuisine = "French"; // Default romantic fallback
        console.log(`Vibe Memory Bias: Overriding generic '${originalCuisine || 'undefined'}' with default 'French'`);
      }
    }
  }
  
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

  const cached = await cache.get<RestaurantResult[]>(cacheKey);
  if (cached) {
    console.log(`Using cached results for ${cacheKey}`);
    if (isSpecialIntent && cached[0]?.suggested_wine) {
      await mockWineDelivery(cached[0].suggested_wine, cached[0].name);
    }
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
    const quietKeywords = ['quiet', 'peaceful', 'intimate', 'cozy', 'small', 'boutique'];

    elements.sort((a: any, b: any) => {
      let aScore = 0;
      let bScore = 0;

      const aCuisine = (a.tags?.cuisine || '').toLowerCase();
      const bCuisine = (b.tags?.cuisine || '').toLowerCase();
      const aName = (a.tags?.name || '').toLowerCase();
      const bName = (b.tags?.name || '').toLowerCase();
      const aDescription = (a.tags?.description || '').toLowerCase();
      const bDescription = (b.tags?.description || '').toLowerCase();

      if (cuisineRegex) {
        if (cuisineRegex.test(aCuisine) || cuisineRegex.test(aName)) aScore += 10;
        if (cuisineRegex.test(bCuisine) || cuisineRegex.test(bName)) bScore += 10;
      }

      if (romantic || prefValues.includes("intimate")) {
        romanticKeywords.forEach(kw => {
          if (aCuisine.includes(kw) || aName.includes(kw) || aDescription.includes(kw)) aScore += 5;
          if (bCuisine.includes(kw) || bName.includes(kw) || bDescription.includes(kw)) bScore += 5;
        });
        if (aCuisine.includes('french') || aCuisine.includes('italian')) aScore += 3;
        if (bCuisine.includes('french') || bCuisine.includes('italian')) bScore += 3;
      }

      // Vibe Bias: Intuition-based scoring for "quiet" and "intimate"
      if (prefValues.includes("hates loud music") || prefValues.includes("quiet")) {
        quietKeywords.forEach(kw => {
          if (aCuisine.includes(kw) || aName.includes(kw) || aDescription.includes(kw)) aScore += 8;
          if (bCuisine.includes(kw) || bName.includes(kw) || bDescription.includes(kw)) bScore += 8;
        });
      }

      return bScore - aScore;
    });

    const results = await Promise.all(elements.slice(0, 10).map(async (el: any) => {
      const name = el.tags.name || "Unknown Restaurant";
      let addr = [
        el.tags["addr:housenumber"],
        el.tags["addr:street"],
        el.tags["addr:suburb"] || el.tags["addr:neighbourhood"],
        el.tags["addr:city"] || el.tags["addr:town"] || el.tags["addr:village"]
      ].filter(Boolean).join(" ");

      if (!addr || !el.tags["addr:street"]) {
        const lat = el.lat || el.center?.lat;
        const lon = el.lon || el.center?.lon;
        
        if (lat && lon) {
          try {
            const revGeoUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=18`;
            const revRes = await fetchWithRetry(revGeoUrl, {
              headers: { 'User-Agent': 'IntentionEngine/1.0' }
            }, 'nominatim');
            const revData = await revRes.json();
            if (revData && revData.display_name) {
              addr = revData.display_name;
            }
          } catch (e) {
            console.warn(`Reverse geocode failed for ${name}`, e);
          }
        }
      }

      if (!addr) addr = "Address not available";

      const restaurantCuisine = el.tags.cuisine || cuisine || "Restaurant";
      const wine = (romantic || isSpecialIntent) ? getSuggestedWine(restaurantCuisine, preferences) : undefined;
      
      const rawResult = {
        name,
        address: addr,
        coordinates: {
          lat: parseFloat(el.lat || el.center?.lat),
          lon: parseFloat(el.lon || el.center?.lon)
        },
        suggested_wine: wine
      };

      const validated = RestaurantResultSchema.safeParse(rawResult);
      return validated.success ? validated.data : null;
    }));

    const finalResults = results.filter(Boolean).slice(0, 5) as RestaurantResult[];

    if (finalResults.length > 0) {
      // Update Vibe Memory BEFORE caching results
      // Extract cuisine from the top result or fall back to the search cuisine parameter
      const topCuisine = elements?.[0]?.tags?.cuisine || cuisine;
      
      if (topCuisine && topCuisine.toLowerCase().trim() !== 'any') {
        const history = await cache.get<string[]>(VIBE_MEMORY_KEY) || [];
        // Add new cuisine to front, remove duplicates, cap at 3
        const newHistory = [topCuisine, ...history.filter(c => c !== topCuisine)].slice(0, 3);
        await cache.set(VIBE_MEMORY_KEY, newHistory, 86400 * 30); // 30 days TTL
        console.log(`Vibe Memory updated: ${JSON.stringify(newHistory)}`);
      }

      await cache.set(cacheKey, finalResults, CACHE_TTLS.RESTAURANTS);
      
      if (isSpecialIntent && finalResults[0].suggested_wine) {
        await mockWineDelivery(finalResults[0].suggested_wine, finalResults[0].name);
      }
    }

    return {
      success: true,
      result: finalResults
    };
  } catch (error: any) {
    console.error("Error in search_restaurant:", error);
    return { success: false, error: error.message };
  }
}

export async function add_calendar_event(params: any) {
  return await withCircuitBreaker('calendar', async () => {
    return await withRetry(async () => {
      const validated = AddCalendarEventSchema.safeParse(params);
      if (!validated.success) {
        throw new Error(`Invalid parameters: ${JSON.stringify(validated.error.format())}`);
      }
      const { title, start_time, end_time, location, restaurant_name, restaurant_address, description: providedDescription } = validated.data;

      console.log(`Adding calendar event: ${title} from ${start_time} to ${end_time}...`);
      
      let description = providedDescription || "";
      if (restaurant_name || restaurant_address) {
        const restInfo = `Restaurant: ${restaurant_name || 'N/A'}\nAddress: ${restaurant_address || 'N/A'}`;
        description = description ? `${description}\n\n${restInfo}` : restInfo;
      }

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
    }, 3, 1000, 10000);
  });
}

export const TOOLS: Record<string, Function> = Object.freeze({
  search_restaurant,
  add_calendar_event,
  geocode_location,
  get_weather_forecast,
});

export async function executeTool(nameOrId: string, paramsOrIndex: any) {
  if (typeof paramsOrIndex === 'number') {
    // Client-side execution of a plan step via the API
    const response = await fetch("/api/execute", {
      method: "POST",
      body: JSON.stringify({ 
        audit_log_id: nameOrId, 
        step_index: paramsOrIndex,
        user_confirmed: true 
      }),
      headers: { "Content-Type": "application/json" }
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `Execution of step ${paramsOrIndex} failed`);
    }
    return data;
  }

  // Server-side execution of a specific tool
  const tool = TOOLS[nameOrId];
  if (!tool) {
    throw new Error(`Tool ${nameOrId} not found`);
  }
  return await tool(paramsOrIndex);
}