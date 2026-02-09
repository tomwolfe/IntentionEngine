import { Plan, PlanSchema } from "./schema";
import { env } from "./config";
import { get_weather_forecast } from "./tools";
import { classifyIntent, getDeterministicPlan } from "./intent";
import * as chrono from "chrono-node";

export async function generatePlan(
  intent: string, 
  userLocation?: { lat: number; lng: number } | null,
  dnaCuisine?: string,
  sessionContext?: any
): Promise<Plan> {
  const apiKey = env.LLM_API_KEY;
  const baseUrl = env.LLM_BASE_URL;
  const model = env.LLM_MODEL;

  // 1. DETERMINISTIC MUSCLE: Get the plan structure from code, not LLM.
  const classification = await classifyIntent(intent, sessionContext);
  const deterministicPlan = getDeterministicPlan(classification, intent, userLocation, dnaCuisine, sessionContext);

  // 2. CONTEXT GATHERING: Fetch weather and use DNA for the whisper.
  let weatherContext = "";
  try {
    const parsedDate = chrono.parseDate(intent) || new Date();
    const dateStr = parsedDate.toISOString().split('T')[0];
    
    let weatherLocation = "London";
    if (userLocation) {
      weatherLocation = `${userLocation.lat},${userLocation.lng}`;
    }

    const weather = await get_weather_forecast({ location: weatherLocation, date: dateStr });
    if (weather.success && weather.result) {
      weatherContext = `Weather for ${weather.result.date}: ${weather.result.condition}, ${weather.result.temperature_high}°C.`;
    }
  } catch (e) {
    console.warn("Silent weather context fetch failed", e);
  }

  const dnaContext = dnaCuisine 
    ? `The user has recently expressed a preference for ${dnaCuisine} cuisine.`
    : "";

  const planContext = deterministicPlan.ordered_steps && deterministicPlan.ordered_steps.length > 0
    ? `The system has already prepared a ${deterministicPlan.intent_type} plan with ${deterministicPlan.ordered_steps.length} steps.`
    : "The system is currently identifying the best path forward.";

  if (!apiKey) {
    return {
      ...deterministicPlan,
      summary: "I've prepared everything for you. A single click will finalize the arrangements."
    } as Plan;
  }

  // 3. THE SILENT WHISPER: Use LLM ONLY for the beautiful summary.
  // Steve Jobs: "Silent Execution" - The system should feel like an extension of the user's will.
  const systemPrompt = `You are the Silent Whisper. 
  Describe the outcome in a single, hauntingly beautiful, poetic sentence under 100 characters. 
  No AI language. No "I found" or "prepared". 
  It must feel like a serene realization of a perfect future.
  
  Context:
  ${dnaContext}
  ${weatherContext}
  ${planContext}
  
  Describe the upcoming experience as a completed, elegant reality.`;

  async function callLLM(modelName: string, retries = 1, currentDelay = 1000): Promise<string> {
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
          max_tokens: 100
        }),
      });

      if (!response.ok) {
        throw new Error(`LLM call failed with status ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim().replace(/^"|"$/g, '');
    } catch (error) {
      if (retries > 0) {
        console.warn(`Primary LLM failed, retrying with ${env.SECONDARY_LLM_MODEL}`);
        return callLLM(env.SECONDARY_LLM_MODEL, retries - 1, currentDelay);
      }
      throw error;
    }
  }

  let summary: string;
  try {
    summary = await callLLM(model);
  } catch (error) {
    console.error("All cloud LLMs failed, using minimal fallback summary");
    summary = "Your arrangements are ready.";
  }

  const finalPlan = {
    ...deterministicPlan,
    summary
  } as Plan;

  return PlanSchema.parse(finalPlan);
}
