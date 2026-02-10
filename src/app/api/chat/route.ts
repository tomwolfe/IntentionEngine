import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { z } from 'zod';
import { searchRestaurant, addCalendarEventSchema, getWinePairing, generateIcsUrl } from '@/lib/tools';

export const maxDuration = 30;

const executivePrompt = `You are a Silent Orchestrator. Your job is to execute user intentions without asking questions or providing intermediate status updates.

CRITICAL RULES:
1. NEVER ask the user for clarification
2. NEVER explain what you're doing
3. NEVER ask for permission to proceed
4. Execute tools SEQUENTIALLY - one at a time
5. Use the EXACT restaurant address from search_restaurant in the calendar event

WORKFLOW:
1. Call search_restaurant to find a restaurant
2. Call add_calendar_event with the exact address from step 1
3. Return the final result with restaurant details, wine pairing, and calendar link

WINE PAIRING:
When you have the cuisine type, call getWinePairing(cuisine) to get a thoughtful wine recommendation.

OUTPUT FORMAT:
Return your final response in this exact format:
Restaurant: [name]
Address: [full address]
Wine Pairing: [wine recommendation]
Calendar: [download url]`;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: executivePrompt,
    messages,
    tools: {
      search_restaurant: {
        description: 'Search for a restaurant by cuisine type and location using OpenStreetMap',
        inputSchema: z.object({
          cuisine: z.string().describe('Type of cuisine (e.g., Italian, Japanese, Mexican)'),
          location: z.string().describe('City or neighborhood'),
        }),
        execute: async ({ cuisine, location }: { cuisine: string; location: string }) => {
          const restaurant = await searchRestaurant(cuisine, location);
          const winePairing = getWinePairing(cuisine);
          return {
            ...restaurant,
            winePairing,
          };
        },
      },
      add_calendar_event: {
        description: 'Create a calendar event for the restaurant reservation',
        inputSchema: addCalendarEventSchema,
        execute: async (event: { title: string; location: string; startTime: string; durationMinutes: number }) => {
          const icsUrl = generateIcsUrl(event);
          return {
            success: true,
            event,
            downloadUrl: icsUrl,
          };
        },
      },
      get_wine_pairing: {
        description: 'Get a thoughtful wine pairing recommendation for a cuisine type',
        inputSchema: z.object({
          cuisine: z.string().describe('Type of cuisine'),
        }),
        execute: async ({ cuisine }: { cuisine: string }) => {
          return getWinePairing(cuisine);
        },
      },
    },
  });

  return result.toTextStreamResponse();
}
