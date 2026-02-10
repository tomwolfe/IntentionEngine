import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { env } from "./config";

const customOpenAI = createOpenAI({
  apiKey: env.LLM_API_KEY,
  baseURL: env.LLM_BASE_URL,
});

export async function parseNaturalLanguageDate(dateStr: string): Promise<Date> {
  // Try native Date parsing first for ISO strings
  const d = new Date(dateStr);
  if (!isNaN(d.getTime()) && dateStr.includes("-")) return d;

  // Use LLM for natural language dates
  try {
    const { text } = await generateText({
      model: customOpenAI(env.LLM_MODEL),
      system: `You are a date parsing utility. 
Convert the user's natural language date string into an ISO 8601 timestamp.
Current time: ${new Date().toISOString()}
Target format: YYYY-MM-DDTHH:mm:ssZ

Return ONLY the ISO string.`,
      prompt: dateStr,
    });

    const parsedDate = new Date(text.trim());
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate;
    }
  } catch (error) {
    console.error("LLM date parsing failed, falling back to basic logic:", error);
  }

  // Fallback to basic logic for common cases if LLM fails
  return basicParseDateTime(dateStr);
}

function basicParseDateTime(dt: string): Date {
  const d = new Date(dt);
  if (!isNaN(d.getTime())) return d;
  
  if (dt.toLowerCase().includes("tomorrow")) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    
    const timeMatch = dt.match(/(\d+)(?::(\d+))?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2] || "0");
      const ampm = (timeMatch[3] || "").toLowerCase();
      
      if (ampm === "pm" && hours < 12) hours += 12;
      if (ampm === "am" && hours === 12) hours = 0;
      
      tomorrow.setHours(hours, minutes, 0, 0);
      return tomorrow;
    }
    return tomorrow;
  }
  return d;
}
