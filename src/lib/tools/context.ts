import { z } from "zod";

export const WeatherSchema = z.object({
  location: z.string().describe("The city or location to get weather for."),
  date: z.string().optional().describe("The date for the weather forecast in ISO 8601 format.")
});

export async function get_weather(params: z.infer<typeof WeatherSchema>) {
  console.log(`Getting weather for ${params.location}${params.date ? ' on ' + params.date : ''}...`);
  return {
    success: true,
    result: {
      location: params.location,
      temperature_c: 22,
      condition: "Partly Cloudy",
      humidity: 45,
      wind_speed_kmh: 15
    }
  };
}
