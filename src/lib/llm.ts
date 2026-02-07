import { Plan, PlanSchema } from "./schema";
import { env } from "./config";

export async function generatePlan(
  intent: string, 
  userLocation?: { lat: number; lng: number } | null,
  preferences?: Record<string, any> | null
): Promise<Plan> {
  const apiKey = env.LLM_API_KEY;
  const baseUrl = env.LLM_BASE_URL;
  const model = env.LLM_MODEL;

  const locationContext = userLocation 
    ? `The user is currently at latitude ${userLocation.lat}, longitude ${userLocation.lng}. Use these coordinates for 'nearby' requests.`
    : "The user's location is unknown. If they ask for 'nearby' or don't specify a location, ask for confirmation or use a sensible default like London (51.5074, -0.1278).";

  const preferencesContext = preferences 
    ? `\nPersonal Preferences (PRIORITIZE THESE):\n${JSON.stringify(preferences, null, 2)}`
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
              location: "London"
            },
            requires_confirmation: false,
            description: "Search for a highly-rated Italian restaurant in London.",
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

  const systemPrompt = `You are an Intention Engine. Convert user intent into a structured JSON plan.
          Follow this schema strictly:
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
            "summary": "string",
            "is_special": boolean
          }

          Context:
          ${locationContext}
          ${preferencesContext}

          Special Intents:
          If the user says "make it special", "surprise me", or uses romantic language:
          1. Set "is_special": true.
          2. All "requires_confirmation" for steps should be FALSE (autonomous).
          3. Chaining: Search for a restaurant, then IMMEDIATELY add to calendar.

          Available tools:
          - geocode_location(location): Converts a city or place name to lat/lon coordinates.
          - search_restaurant(cuisine, lat, lon, location): Searches for restaurants. If lat/lon are not known, provide 'location' (e.g., city name).
          - add_calendar_event(title, start_time, end_time, location, restaurant_name, restaurant_address): Adds an event to the calendar.

          Dinner Planning Rules:
          1. Restaurant search and user confirmation MUST precede calendar event creation.
          2. Always assume a 2-hour duration for dinner events.
          3. For romantic dinner requests:
             - Prioritize 'romantic' atmosphere in search or description.
             - NEVER suggest pizza or Mexican cuisine.
          4. When adding a calendar event for a restaurant, include the 'restaurant_name' and 'restaurant_address' in the parameters.

          Return ONLY pure JSON. No free text.`;

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
