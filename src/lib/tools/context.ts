import { z } from "zod";
import { ToolDefinitionMetadata, ToolParameter } from "./types";

export const WeatherSchema = z.object({
  location: z.string().describe("The city or location to get weather for."),
  date: z.string().optional().describe("The date for the weather forecast in ISO 8601 format.")
});

export type WeatherParams = z.infer<typeof WeatherSchema>;

export const weatherToolParameters: ToolParameter[] = [
  {
    name: "location",
    type: "string",
    description: "The city or location to get weather for.",
    required: true
  },
  {
    name: "date",
    type: "string",
    description: "The date for the weather forecast in ISO 8601 format.",
    required: false
  }
];

export const weatherReturnSchema = {
  location: "string",
  temperature_c: "number",
  condition: "string",
  humidity: "number",
  wind_speed_kmh: "number"
};

export async function get_weather(params: WeatherParams): Promise<{ success: boolean; result?: any; error?: string }> {
  const validated = WeatherSchema.safeParse(params);
  if (!validated.success) {
    return { success: false, error: "Invalid parameters: " + validated.error.message };
  }
  
  const { location, date } = validated.data;
  console.log(`Getting weather for ${location}${date ? ' on ' + date : ''}...`);
  
  try {
    // Placeholder for actual weather API integration
    // In production, this would integrate with OpenWeatherMap, WeatherAPI, etc.
    // const apiKey = process.env.WEATHER_API_KEY; // Placeholder for API key
    
    return {
      success: true,
      result: {
        location: location,
        temperature_c: 22,
        condition: "Partly Cloudy",
        humidity: 45,
        wind_speed_kmh: 15
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export const getWeatherToolDefinition: ToolDefinitionMetadata = {
  name: "get_weather",
  version: "1.0.0",
  description: "Gets weather forecast for a specific location and optional date for temporal planning context.",
  parameters: weatherToolParameters,
  return_schema: weatherReturnSchema,
  timeout_ms: 15000,
  requires_confirmation: false,
  category: "data",
  rate_limits: {
    requests_per_minute: 60,
    requests_per_hour: 1000
  }
};
