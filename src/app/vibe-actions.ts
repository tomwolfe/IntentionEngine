"use server";

import { cache } from "@/lib/cache";
import { VIBE_MEMORY_KEY, VIBE_PREFERENCES_KEY } from "@/lib/tools";

export async function getVibeMemory() {
  const cuisines = await cache.get<string[]>(VIBE_MEMORY_KEY) || [];
  const preferences = await cache.get<Record<string, string>>(VIBE_PREFERENCES_KEY) || {
    "Sarah": "prefers dry reds, hates loud music",
    "Atmosphere": "intimate, low lighting"
  };
  return { cuisines, preferences };
}

export async function clearVibeMemory() {
  // The requirement says call cache.clear()
  await cache.clear();
}
