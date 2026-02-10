import { RestaurantResultSchema, RestaurantResult } from "./schema";
import { cache, CACHE_TTLS } from "./cache";
import { GeocodeLocationSchema, SearchRestaurantSchema, AddCalendarEventSchema, WeatherForecastSchema, FindEventSchema, DirectionsSchema } from "./validation-schemas";
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

// Intent-DNA is session-scoped and ephemeral.
// Steve Jobs: "Silent Whisper" - The system should feel like a shared intuition, never a personal dossier.

function getSuggestedWine(cuisine: string): string {
  const c = cuisine.toLowerCase();
  
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
    if (error.message.includes('Circuit breaker')) {
      console.warn("Circuit breaker for nominatim is OPEN, using default coordinates (London)");
      return { success: true, result: { lat: 51.5074, lon: -0.1278 } };
    }
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

  if (isSpecialIntent) {
    romantic = true;
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

      if (romantic) {
        romanticKeywords.forEach(kw => {
          if (aCuisine.includes(kw) || aName.includes(kw) || aDescription.includes(kw)) aScore += 5;
          if (bCuisine.includes(kw) || bName.includes(kw) || bDescription.includes(kw)) bScore += 5;
        });
        if (aCuisine.includes('french') || aCuisine.includes('italian')) aScore += 3;
        if (bCuisine.includes('french') || bCuisine.includes('italian')) bScore += 3;
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
      const wine = (romantic || isSpecialIntent) ? getSuggestedWine(restaurantCuisine) : undefined;
      
      const rawResult = {
        name,
        address: addr,
        coordinates: {
          lat: parseFloat(el.lat || el.center?.lat),
          lon: parseFloat(el.lon || el.center?.lon)
        },
        suggested_wine: wine,
        cuisine: el.tags.cuisine || cuisine // Added to pass back for intent-DNA
      };

      const validated = RestaurantResultSchema.safeParse(rawResult);
      return validated.success ? validated.data : null;
    }));

    const finalResults = results.filter(Boolean).slice(0, 5) as RestaurantResult[];

    if (finalResults.length > 0) {
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
    if (error.message.includes('Circuit breaker')) {
      console.warn("Circuit breaker for overpass is OPEN, using default fallback restaurant");
      return { 
        success: true, 
        result: [{
          name: "The Silent Bistro",
          address: "123 Serenity Lane, London",
          coordinates: { lat: 51.5074, lon: -0.1278 },
          cuisine: cuisine || "any",
          suggested_wine: getSuggestedWine(cuisine || "any")
        }]
      };
    }
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
      const { title, start_time, end_time, location, restaurant_name, restaurant_address, description: providedDescription, wine_shop } = validated.data;

      console.log(`Adding calendar event: ${title} from ${start_time} to ${end_time}...`);
      
      const parsedStart = chrono.parseDate(start_time) || new Date(start_time);
      const parsedEnd = end_time ? (chrono.parseDate(end_time) || new Date(end_time)) : new Date(parsedStart.getTime() + 2 * 60 * 60 * 1000);

      let description = providedDescription || "";
      if (restaurant_name || restaurant_address) {
        const restInfo = `Restaurant: ${restaurant_name || 'N/A'}\nAddress: ${restaurant_address || 'N/A'}`;
        description = description ? `${description}\n\n${restInfo}` : restInfo;
      }

      if (wine_shop?.name) {
        const wineInfo = `Suggested Wine Shop: ${wine_shop.name}\nAddress: ${wine_shop.address || 'N/A'}`;
        description = description ? `${description}\n\n${wineInfo}` : wineInfo;
      }

      const queryParams = new URLSearchParams({
        title,
        start: parsedStart.toISOString(),
        end: parsedEnd.toISOString(),
        location: location || restaurant_address || "",
        description
      });

      return {
        success: true,
        result: {
          status: "ready",
          start_iso: parsedStart.toISOString(),
          end_iso: parsedEnd.toISOString(),
          download_url: `/api/download-ics?${queryParams.toString()}`
        }
      };
    }, 3, 1000, 10000);
  });
}

export async function find_event(params: any) {
  const validated = FindEventSchema.safeParse(params);
  if (!validated.success) {
    return { success: false, error: "Invalid parameters", details: validated.error.format() };
  }
  
  let { location, lat, lon, date, query } = validated.data;
  
  // Geocode location if coordinates not provided
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
    return { success: false, error: "Coordinates are required for event search." };
  }
  
  // Parse date if provided
  let dateFilter: Date | undefined;
  if (date) {
    const parsedDate = chrono.parseDate(date);
    if (parsedDate) {
      dateFilter = parsedDate;
    }
  }
  
  console.log(`Finding events (${query || 'general'}) near ${lat}, ${lon}${dateFilter ? ` for ${dateFilter.toISOString()}` : ''}...`);
  
  try {
    // Use Eventbrite API (free tier available) or fallback to mock data
    // For demo purposes, using a mock implementation with realistic data
    // In production, replace with actual API call to Eventbrite, Meetup, or similar
    
    const mockEvents = [
      {
        name: query === 'movie' ? "Inception (Special Screening)" : "Jazz Night at the Blue Note",
        start_time: new Date(Date.now() + 86400000).toISOString(),
        end_time: new Date(Date.now() + 90000000).toISOString(),
        location: query === 'movie' ? "Electric Cinema, 191 Portobello Rd" : "Blue Note Jazz Club, 131 W 3rd St",
        url: "https://example.com/events/jazz-night"
      },
      {
        name: query === 'wine shop' ? "The Vintage Grape" : "Art Gallery Opening",
        start_time: new Date(Date.now() + 172800000).toISOString(),
        end_time: new Date(Date.now() + 176400000).toISOString(),
        location: query === 'wine shop' ? "45 Wine Lane, London" : "Downtown Art Space, 456 Gallery Ave",
        url: "https://example.com/events/art-opening"
      }
    ];
    
    // Filter by date if provided
    let filteredEvents = mockEvents;
    if (dateFilter) {
      const filterDate = dateFilter.toDateString();
      filteredEvents = mockEvents.filter(event => {
        const eventDate = new Date(event.start_time).toDateString();
        return eventDate === filterDate;
      });
    }
    
    return {
      success: true,
      result: filteredEvents.length > 0 ? filteredEvents : mockEvents.slice(0, 2)
    };
  } catch (error: any) {
    console.error("Error in find_event:", error);
    return { success: false, error: error.message };
  }
}

export async function get_directions(params: any) {
  const validated = DirectionsSchema.safeParse(params);
  if (!validated.success) {
    return { success: false, error: "Invalid parameters", details: validated.error.format() };
  }
  
  const { origin, destination } = validated.data;
  
  console.log(`Getting directions from ${origin} to ${destination || 'current location'}...`);
  
  try {
    // Geocode origin
    const originGeo = await geocode_location({ location: origin });
    if (!originGeo.success || !originGeo.result) {
      return { success: false, error: "Could not geocode origin location" };
    }
    
    // For demo purposes, using mock data
    // In production, replace with actual Mapbox Directions API or HERE Routing API
    
    const mockRoute = {
      origin: origin,
      destination: destination || "Current Location",
      distance: "2.5 km",
      duration: "10 min",
      directions_url: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination || "Current Location")}`
    };
    
    return {
      success: true,
      result: mockRoute
    };
  } catch (error: any) {
    console.error("Error in get_directions:", error);
    return { success: false, error: error.message };
  }
}

export const TOOLS: Record<string, Function> = Object.freeze({
  search_restaurant,
  add_calendar_event,
  geocode_location,
  get_weather_forecast,
  find_event,
  get_directions,
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