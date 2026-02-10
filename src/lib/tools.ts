import { z } from "zod";
import { RestaurantResultSchema } from "./schema";

export interface ToolResult<T = any> {
  success: boolean;
  result?: T;
  error?: string;
  reasoning?: string;
  requiresConfirmation?: boolean;
  draft?: boolean;
}

export const tools = {
  get_weather: {
    description: "Get weather forecast for a specific location using real-time data from Open-Meteo.",
    parameters: z.object({
      location: z.string().describe("The city name or location to get weather for"),
      days: z.number().optional().default(3).describe("Number of forecast days (1-7)"),
    }),
    execute: async ({ location, days }: { location: string; days: number }): Promise<ToolResult> => {
      console.log(`Getting weather for: ${location}`);
      try {
        // 1. Geocoding
        const geoRes = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`
        );
        const geoData = await geoRes.json();
        
        if (!geoData.results || geoData.results.length === 0) {
          throw new Error(`Location "${location}" not found.`);
        }

        const { latitude, longitude, name, country } = geoData.results[0];

        // 2. Weather Forecast
        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=weathercode,temperature_2m_max,temperature_2m_min&current_weather=true&timezone=auto`
        );
        const weatherData = await weatherRes.json();

        const weatherCodeMap: Record<number, string> = {
          0: "Clear sky",
          1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
          45: "Fog", 48: "Depositing rime fog",
          51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
          61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
          71: "Slight snow fall", 73: "Moderate snow fall", 75: "Heavy snow fall",
          95: "Thunderstorm",
        };

        const forecast = weatherData.daily.time.slice(0, days).map((date: string, i: number) => ({
          date,
          condition: weatherCodeMap[weatherData.daily.weathercode[i]] || "Cloudy",
          temperature: {
            high: weatherData.daily.temperature_2m_max[i],
            low: weatherData.daily.temperature_2m_min[i],
            unit: '°C'
          }
        }));

        return {
          success: true,
          result: {
            location: `${name}, ${country}`,
            current: {
              condition: weatherCodeMap[weatherData.current_weather.weathercode] || "Clear",
              temperature: weatherData.current_weather.temperature,
              wind_speed: weatherData.current_weather.windspeed,
              unit: '°C'
            },
            forecast
          },
          reasoning: `Retrieved live weather data for ${name}, ${country} via Open-Meteo. Currently ${weatherData.current_weather.temperature}°C and ${weatherCodeMap[weatherData.current_weather.weathercode] || 'clear'}.`
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  },

  web_search: {
    description: "Search the web for real-time information using Tavily API.",
    parameters: z.object({
      query: z.string().describe("The search query"),
    }),
    execute: async ({ query }: { query: string }): Promise<ToolResult> => {
      console.log(`Web search for: ${query}`);
      const apiKey = process.env.TAVILY_API_KEY;
      
      if (!apiKey) {
        return { success: false, error: "Tavily API key not configured." };
      }

      try {
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            search_depth: "regular",
            include_answer: true,
            max_results: 5
          })
        });

        const data = await response.json();
        
        return {
          success: true,
          result: data.results.map((r: any) => ({
            title: r.title,
            url: r.url,
            snippet: r.content
          })),
          reasoning: `Performed a live web search for "${query}" using Tavily. Found ${data.results.length} relevant results.`
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  },

  search_restaurant: {
    description: "Search for restaurants nearby based on cuisine and location using OpenStreetMap data.",
    parameters: z.object({
      cuisine: z.string().optional().describe("The type of cuisine, e.g. 'Italian', 'Sushi'"),
      lat: z.number().describe("The latitude coordinate"),
      lon: z.number().describe("The longitude coordinate"),
    }),
    execute: async ({ cuisine, lat, lon }: { cuisine?: string; lat: number; lon: number }): Promise<ToolResult> => {
      console.log(`Searching for ${cuisine || 'restaurants'} near ${lat}, ${lon}...`);
      try {
        const query = cuisine 
          ? `[out:json][timeout:25];(nwr["amenity"="restaurant"]["cuisine"~"${cuisine}",i](around:10000,${lat},${lon});nwr["amenity"="restaurant"](around:5000,${lat},${lon}););out center 10;`
          : `[out:json][timeout:25];nwr["amenity"="restaurant"](around:10000,${lat},${lon});out center 10;`;

        const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
        const overpassRes = await fetch(overpassUrl);
        const overpassData = await overpassRes.json();
        
        const results = (overpassData.elements || []).map((el: any) => ({
          name: el.tags.name || "Unknown Restaurant",
          address: [el.tags["addr:housenumber"], el.tags["addr:street"], el.tags["addr:city"]].filter(Boolean).join(" ") || "Address not available",
          coordinates: { lat: parseFloat(el.lat || el.center?.lat), lon: parseFloat(el.lon || el.center?.lon) }
        })).slice(0, 5);

        return {
          success: true,
          result: results,
          reasoning: `Found ${results.length} restaurants near your location using OpenStreetMap data.`
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    }
  },

  add_calendar_event: {
    description: "Add an event to the calendar. ALWAYS returns a draft first.",
    parameters: z.object({
      title: z.string().describe("The title of the event"),
      start_time: z.string().describe("The start time in ISO format"),
      end_time: z.string().describe("The end time in ISO format"),
      location: z.string().optional().describe("The location of the event"),
      confirmed: z.boolean().optional().describe("Set to true only after user confirms"),
    }),
    execute: async ({ title, start_time, end_time, location, confirmed }: { 
      title: string; start_time: string; end_time: string; location?: string; confirmed?: boolean 
    }): Promise<ToolResult> => {
      const queryParams = new URLSearchParams({ title, start: start_time, end: end_time, location: location || "" });

      if (!confirmed) {
        return {
          success: true,
          draft: true,
          requiresConfirmation: true,
          result: { title, start_time, end_time, location, status: "draft" },
          reasoning: "Draft created. Please confirm to finalize the calendar event."
        };
      }

      return {
        success: true,
        result: { status: "confirmed", download_url: `/api/download-ics?${queryParams.toString()}` },
        reasoning: "Event confirmed and .ics file generated."
      };
    }
  },

    update_user_context: {

      description: "Update the user's persistent context/memory (preferences, names, facts).",

      parameters: z.object({

        context: z.string().describe("The information to remember about the user"),

      }),

      execute: async ({ context }: { context: string }): Promise<ToolResult> => {

        return {

          success: true,

          result: { context },

          reasoning: `Context updated: "${context}". This information will be saved to your local profile.`

        };

      }

    },

  

    update_goal: {

      description: "Update the current objective and steps completed for the goal sidebar.",

      parameters: z.object({

        objective: z.string().describe("The high-level goal being pursued"),

        steps_completed: z.array(z.string()).describe("List of steps already finished"),

        next_step: z.string().optional().describe("The immediate next step"),

      }),

      execute: async ({ objective, steps_completed, next_step }: { 

        objective: string; steps_completed: string[]; next_step?: string 

      }): Promise<ToolResult> => {

        return {

          success: true,

          result: { objective, steps_completed, next_step },

          reasoning: `Goal updated: ${objective}`

        };

      }

    }

  };

  