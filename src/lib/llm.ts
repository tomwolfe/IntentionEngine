import { Plan, PlanSchema } from "./schema";
import { env } from "./config";
import { getToolDefinitions } from "./tools";
import { Redis } from "@upstash/redis";
import { lruCache } from "./cache";

const redis = (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: env.UPSTASH_REDIS_REST_URL,
      token: env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

export async function generatePlan(intent: string, userLocation?: { lat: number; lng: number } | null): Promise<Plan> {
  const apiKey = env.LLM_API_KEY;
  const baseUrl = env.LLM_BASE_URL;
  const model = env.LLM_MODEL;

  // Cache key based on intent and location (rounded to 0.1 degree)
  const locKey = userLocation ? `${userLocation.lat.toFixed(1)},${userLocation.lng.toFixed(1)}` : "no-loc";
  const cacheKey = `plan:${intent.toLowerCase().trim()}:${locKey}`;

  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return PlanSchema.parse(cached);
    } catch (err) {
      console.warn("Plan cache read failed:", err);
    }
  }

  const localCached = lruCache.get(cacheKey);
  if (localCached) return PlanSchema.parse(localCached);

  const toolDefinitions = getToolDefinitions();
  const toolsDescription = toolDefinitions.map(tool => {
    return `- ${tool.name}: ${tool.description}. Parameters: ${JSON.stringify(tool.parameters.shape)}`;
  }).join("\n");

  const locationContext = userLocation 
    ? `The user is currently at latitude ${userLocation.lat}, longitude ${userLocation.lng}. Use these coordinates for 'nearby' requests.`
    : "The user's location is unknown. If they ask for 'nearby' or don't specify a location, ask for confirmation or use a sensible default like London (51.5074, -0.1278).";

  if (!apiKey) {
    throw new Error("LLM_API_KEY is not set.");
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
            "intent_type": "string (e.g., 'dining', 'scheduling', 'communication', 'weather', 'lookup')",
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
          ${toolsDescription}

          Plan Execution Rules:
          1. If a tool requires confirmation (requires_confirmation: true), it should be clearly marked in the plan.
          2. Break down complex requests into multiple steps if necessary.
          3. If the user's intent requires information from a previous step (e.g., coordinates from geocoding), ensure the steps are ordered correctly.
          4. For dining requests followed by a calendar event, always search for the restaurant first, then add the event.

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
  const plan = PlanSchema.parse(planJson);

  // Cache the plan
  if (redis) {
    try {
      await redis.setex(cacheKey, 86400, plan); // 24h TTL
    } catch (err) {
      console.warn("Plan cache write failed:", err);
    }
  }
  lruCache.set(cacheKey, plan, 86400);

  return plan;
}
