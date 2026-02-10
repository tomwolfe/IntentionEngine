import { Plan, PlanSchema } from "./schema";
import { env } from "./config";

export async function generatePlan(intent: string, userLocation?: { lat: number; lng: number } | null): Promise<Plan> {
  const apiKey = env.LLM_API_KEY;
  const baseUrl = env.LLM_BASE_URL;
  const model = env.LLM_MODEL;

  const locationContext = userLocation 
    ? `The user is currently at latitude ${userLocation.lat}, longitude ${userLocation.lng}. Use these coordinates for 'nearby' requests.`
    : "The user's location is unknown. If they ask for 'nearby' or don't specify a location, ask for confirmation or use a sensible default like London (51.5074, -0.1278).";

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

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: "system",
          content: `You are an Intention Engine. Convert user intent into a structured JSON plan.
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
            "summary": "string"
          }

          Context:
          ${locationContext}

          Available tools:
          - geocode_location(location, userLocation: {lat, lng}): Converts a city or place name to lat/lon coordinates. Returns { lat, lon }.
          - search_restaurant(cuisine, lat, lon, location, userLocation: {lat, lng}): Searches for restaurants. If lat/lon are not known, provide 'location' (e.g., city name). Returns a list of restaurants.
          - add_calendar_event(events: [{title, start_time, end_time, location, restaurant_name, restaurant_address}]): Adds events to the calendar.

          Tool Chaining & Context Injection:
          1. Explicitly map outputs from previous steps to inputs of subsequent steps.
          2. Use the syntax \`{{step_N.result.field}}\` to reference the output of a previous step (where N is the 0-based index of the step).
          3. Example: If Step 0 is \`geocode_location\`, Step 1 should use \`{{step_0.result.lat}}\` and \`{{step_0.result.lon}}\` for its coordinates.
          4. Example: If Step 1 is \`search_restaurant\`, Step 2 (\`add_calendar_event\`) should use \`{{step_1.result[0].name}}\` for \`restaurant_name\` if a specific restaurant selection is implied.

          Dinner Planning Rules:
          1. Restaurant search and user confirmation MUST precede calendar event creation.
          2. Always assume a 2-hour duration for dinner events.
          3. For romantic dinner requests:
             - Prioritize 'romantic' atmosphere in search or description.
             - NEVER suggest pizza or Mexican cuisine.
          4. When adding a calendar event for a restaurant, include the 'restaurant_name' and 'restaurant_address' in the parameters.
          5. Always use coordinates from \`geocode_location\` if you use that tool, instead of passing the raw location string to \`search_restaurant\`.
          6. For 'add_calendar_event', always provide an array of events under the 'events' key.

          Return ONLY pure JSON. No free text.`
        },
        {
          role: "user",
          content: intent
        }
      ],
      response_format: { type: "json_object" }
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`LLM call failed: ${error}`);
  }

  const data = await response.json();
  const planJson = JSON.parse(data.choices[0].message.content);
  
  // Validate against schema
  return PlanSchema.parse(planJson);
}

export async function replan(originalIntent: string, auditLog: any, failedStepIndex: number, error: string): Promise<Plan> {
  const apiKey = env.LLM_API_KEY;
  const baseUrl = env.LLM_BASE_URL;
  const model = env.LLM_MODEL;

  if (!apiKey) {
    throw new Error("LLM_API_KEY is not set. Re-planning requires LLM access.");
  }

  // Build a concise summary of the execution history for the LLM
  const executionHistory = auditLog.steps.map((s: any) => {
    return `Step ${s.step_index}: ${s.tool_name} -> ${s.status}${s.error ? ` (Error: ${s.error})` : ''}`;
  }).join('\n');

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model,
      messages: [
        {
          role: "system",
          content: `You are an Intention Engine in Re-planning mode.
          A previous plan failed at step ${failedStepIndex}.
          Specific Error: ${error}
          
          Original Intent: ${originalIntent}
          
          Execution History:
          ${executionHistory}
          
          Full Audit Log State: ${JSON.stringify(auditLog)}
          
          Your task is to provide a NEW plan to recover from this error.
          - If a tool failed due to missing information, try to find it in a different way or ask (by adding a step that returns what's needed).
          - If the user's intent cannot be fulfilled exactly, suggest the closest possible alternative.
          - The new plan will replace the remaining steps of the old plan.
          
          Follow this schema strictly:
          {
            "intent_type": "string",
            "constraints": ["string array"],
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

          Available tools:
          - geocode_location(location, userLocation: {lat, lng})
          - search_restaurant(cuisine, lat, lon, location, userLocation: {lat, lng})
          - add_calendar_event(events: [{title, start_time, end_time, location, restaurant_name, restaurant_address}])

          Return ONLY pure JSON.`
        }
      ],
      response_format: { type: "json_object" }
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM re-plan call failed: ${errorText}`);
  }

  const data = await response.json();
  const planJson = JSON.parse(data.choices[0].message.content);
  return PlanSchema.parse(planJson);
}
