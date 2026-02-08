"use server";

import { cache } from "@/lib/cache";
import { VIBE_MEMORY_KEY } from "@/lib/tools";

export async function getVibeMemory() {
  return await cache.get<string[]>(VIBE_MEMORY_KEY) || [];
}

export async function clearVibeMemory() {
  // The requirement says call cache.clear()
  await cache.clear();
}
