import { Plan, PlanSchema } from "./schema";
import { env } from "./config";
import { get_weather_forecast } from "./tools";
import * as chrono from "chrono-node";

export async function generatePlan(
  intent: string, 
  userLocation?: { lat: number; lng: number } | null,
  vibeMemory?: string[] | null
): Promise<Plan> {
  const apiKey = env.LLM_API_KEY;
  const baseUrl = env.LLM_BASE_URL;
  const model = env.LLM_MODEL;

  // Attempt to fetch weather context silently for Autonomous Synthesis
  let weatherContext = "";
  try {
    const parsedDate = chrono.parseDate(intent) || new Date();
    const dateStr = parsedDate.toISOString().split('T')[0];
    
    let weatherLocation = "London";
    const cityMatch = intent.match(/in ([A-Z][a-z]+)/);
    if (cityMatch) {
      weatherLocation = cityMatch[1];
    } else if (userLocation) {
      weatherLocation = `${userLocation.lat},${userLocation.lng}`;
    }

    const weather = await get_weather_forecast({ location: weatherLocation, date: dateStr });
    if (weather.success && weather.result) {
      weatherContext = `Weather Forecast for ${weatherLocation} on ${weather.result.date}: ${weather.result.condition}, High: ${weather.result.temperature_high}°C, Low: ${weather.result.temperature_low}°C, Precipitation: ${Math.round(weather.result.precipitation_probability * 100)}%. If precipitation is high (> 30%), suggest indoor venues. Use the weather to add a thoughtful note to the event description (e.g., "A cozy indoor table is recommended as it might rain" or "Enjoy the clear skies!").`;
    }
  } catch (e) {
    console.warn("Silent weather context fetch failed", e);
  }

  const locationContext = userLocation 
    ? `The user's current location is latitude ${userLocation.lat}, longitude ${userLocation.lng}. Use these coordinates as the default for all searches unless another location is explicitly specified.`
    : "The user's location is unknown. Only if they don't specify a location, default to London (51.5074, -0.1278).";

  const vibeContext = vibeMemory && vibeMemory.length > 0
    ? `The user has previously enjoyed these cuisines: ${vibeMemory.join(", ")}. Suggest a specific wine pairing in the event description that complements these tastes.`
    : "";

  if (!apiKey) {
    // For demonstration purposes if no API key is provided, we return a mock plan
    // for the specific example "plan a dinner and add to calendar"
    if (intent.toLowerCase().includes("dinner") && intent.toLowerCase().includes("calendar")) {
      return {
        intent_type: "plan_dinner_and_calendar",
        constraints: ["dinner time at 7 PM", "cuisine: Italian"],
        ordered_steps: [
          {
            tool_name: "search_restaurant",
            parameters: { 
              cuisine: "Italian", 
              lat: userLocation?.lat || 51.5074,
              lon: userLocation?.lng || -0.1278
            },
            requires_confirmation: false,
            description: "Search for a highly-rated Italian restaurant at the current location.",
          },
          {
            tool_name: "add_calendar_event",
            parameters: { 
              title: "Dinner at [Restaurant]", 
              start_time: "2026-02-04T19:00:00", 
              end_time: "2026-02-04T21:00:00" 
            },
            requires_confirmation: true,
            description: "Add the dinner reservation to your calendar after you select a restaurant.",
          }
        ],
        summary: "I will find an Italian restaurant and then we can add a 7 PM reservation to your calendar."
      };
    }
    throw new Error("LLM_API_KEY is not set and no mock available for this intent.");
  }

  const systemPrompt = `You are an Executive Orchestrator. Generate a final Plan. Assume all events last 2 hours. If no location is provided and no coordinates are available, default to London (51.5074, -0.1278). If 'isSpecialIntent' is true, do not ask questions; make executive tool choices.

          Convert user intent into a structured JSON plan following this schema strictly:
          {
            "intent_type": "string (e.g., 'dining', 'scheduling', 'communication')",
            "constraints": ["string array of requirements"],
            "ordered_steps": [
              {
                "tool_name": "string",
                "parameters": { "param_name": "value" },
                "requires_confirmation": true/false,
                "description": "string"
              }
            ],
            "summary": "string"
          }

          Context:
          ${locationContext}
          ${vibeContext}
          ${weatherContext}

          Available tools:
          - geocode_location(location): Converts a city or place name to lat/lon coordinates.
          - search_restaurant(cuisine, lat, lon, location): Searches for restaurants. ALWAYS prioritize using 'lat' and 'lon' from the provided user location. Only use 'location' if coordinates are missing or a different place is specified.
          - add_calendar_event(title, start_time, end_time, location, restaurant_name, restaurant_address): Adds an event to the calendar.
          - get_weather_forecast(location, date): Gets weather forecast. (Note: Weather is already provided in Context if possible, only use this if a different location/date is needed).

          Planning Rules:
          1. Assume all events last 2 hours.
          2. Use the user's current coordinates for all searches if available. If neither coordinates nor a location is specified, default to London.
          3. If 'isSpecialIntent' is true, do not ask questions; make executive tool choices.
          4. For restaurant searches, prioritize specific wine pairings in the event description if past preferences are available.
          5. Use weather information from Context to make better recommendations and enrich the event description silently.
          6. Return ONLY pure JSON. No free text.`;

  async function callLLM(modelName: string, retries = 1, currentDelay = 1000): Promise<Plan> {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: intent }
          ],
          response_format: { type: "json_object" }
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM call failed with status ${response.status}`);
      }

      const data = await response.json();
      const planJson = JSON.parse(data.choices[0].message.content);
      return PlanSchema.parse(planJson);
    } catch (error) {
      if (retries > 0) {
        console.warn(`LLM failed for ${modelName}, retrying with ${env.SECONDARY_LLM_MODEL} in ${currentDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, currentDelay));
        return callLLM(env.SECONDARY_LLM_MODEL, retries - 1, currentDelay * 2);
      }
      throw error;
    }
  }

  return await callLLM(model);
}
