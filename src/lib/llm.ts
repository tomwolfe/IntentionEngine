import { Plan, PlanSchema } from "./schema";
import { env } from "./config";
import { get_weather_forecast } from "./tools";
import { classifyIntent, getDeterministicPlan } from "./intent";
import * as chrono from "chrono-node";

export async function generatePlan(
  intent: string, 
  userLocation?: { lat: number; lng: number } | null,
  vibeMemory?: string[] | null,
  vibePreferences?: Record<string, string> | null
): Promise<Plan> {
  const apiKey = env.LLM_API_KEY;
  const baseUrl = env.LLM_BASE_URL;
  const model = env.LLM_MODEL;

  // 1. DETERMINISTIC MUSCLE: Get the plan structure from code, not LLM.
  const classification = await classifyIntent(intent);
  const deterministicPlan = getDeterministicPlan(classification, intent, userLocation);

  // 2. CONTEXT GATHERING: Fetch weather and use vibe for the whisper.
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

  const vibeContext = vibePreferences && Object.keys(vibePreferences).length > 0
    ? `User Preferences: ${Object.entries(vibePreferences).map(([k, v]) => `${k} ${v}`).join(", ")}.`
    : "";

  if (!apiKey) {
    return {
      ...deterministicPlan,
      summary: "I've prepared everything for you. A single click will finalize the arrangements."
    } as Plan;
  }

  // 3. THE SILENT WHISPER: Use LLM ONLY for the beautiful summary.
  const systemPrompt = `You are the Silent Whisper of an intuitive system. Your only job is to describe the outcome the system has already perfectly prepared in a single, beautiful, and poetic sentence. 
  
  Do not explain what you are doing. 
  Do not list steps. 
  Do not ask questions. 
  
  Focus on the feeling of being understood and the elegance of the outcome.
  
  Context:
  ${vibeContext}
  ${weatherContext}
  
  The system is already finding the venue and preparing the calendar event. 
  Describe this as a completed thought, anticipating their desire.`;

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
      return data.choices[0].message.content.trim();
    } catch (error) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, currentDelay));
        return callLLM(env.SECONDARY_LLM_MODEL, retries - 1, currentDelay * 2);
      }
      throw error;
    }
  }

  const summary = await callLLM(model);

  const finalPlan = {
    ...deterministicPlan,
    summary
  } as Plan;

  return PlanSchema.parse(finalPlan);
}
