import { Plan, PlanSchema } from "./schema";

export async function generatePlan(intent: string, userLocation?: { lat: number; lng: number } | null): Promise<Plan> {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.LLM_MODEL || "glm-4.7-flash";

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
              lat: userLocation?.lat || 51.5074, 
              lon: userLocation?.lng || -0.1278 
            },
            requires_confirmation: false,
            description: "Search for a highly-rated Italian restaurant nearby.",
          },
          {
            tool_name: "add_calendar_event",
            parameters: { 
              title: "Dinner at [Restaurant]", 
              start_time: "2026-02-03T19:00:00", 
              end_time: "2026-02-03T21:00:00" 
            },
            requires_confirmation: true,
            description: "Add the dinner reservation to your calendar.",
          }
        ],
        summary: "I will find an Italian restaurant and add a 7 PM reservation to your calendar."
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
          - search_restaurant(cuisine, lat, lon)
          - add_calendar_event(title, start_time, end_time, location)
          - send_message(recipient, body)

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
