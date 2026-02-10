import { z } from "zod";
import { Tool, ToolResult } from "./types";
import { env } from "../config";
import { getGeocodingProvider } from "../providers";

const WeatherParams = z.object({
  location: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  units: z.enum(["metric", "imperial"]).default("metric"),
});

type Params = z.infer<typeof WeatherParams>;

export const weatherTool: Tool<Params> = {
  definition: {
    name: "get_weather",
    description: "Gets the current weather for a location.",
    parameters: WeatherParams,
    requires_confirmation: false,
  },
  execute: async (params: Params): Promise<ToolResult> => {
    let { lat, lon, location, units } = params;
    const apiKey = env.OPENWEATHER_API_KEY;

    if (!apiKey) {
      return { success: true, result: { info: "Weather service not configured. Provide OPENWEATHER_API_KEY." } };
    }

    if ((lat === undefined || lon === undefined) && location) {
      const geocoder = getGeocodingProvider();
      const geo = await geocoder.geocode(location);
      if (geo) {
        lat = geo.lat;
        lon = geo.lon;
      }
    }

    if (lat === undefined || lon === undefined) {
      return { success: false, error: "Coordinates or valid location required for weather." };
    }

    try {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${apiKey}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Weather API error: ${response.statusText}`);
      const data = await response.json();
      
      return {
        success: true,
        result: {
          temperature: data.main.temp,
          feels_like: data.main.feels_like,
          description: data.weather[0]?.description,
          city: data.name,
          units: units === "metric" ? "°C" : "°F"
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
};
