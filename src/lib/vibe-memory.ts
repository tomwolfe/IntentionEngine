import { cache } from "./cache";

export interface PersonalPreferences {
  user_id: string;
  preferences: {
    wine_taste?: string;
    favorite_cuisines?: string[];
    atmosphere_preference?: string;
    [key: string]: any;
  };
}

const PREFERENCES_PREFIX = "vibe_prefs:";

export async function getPersonalPreferences(user_id: string): Promise<PersonalPreferences["preferences"] | null> {
  const data = await cache.get<PersonalPreferences["preferences"]>(`${PREFERENCES_PREFIX}${user_id}`);
  
  // Default fallback if no preferences found for demonstration
  if (!data && user_id === "sarah_id") {
    const sarahPrefs = {
      wine_taste: "Bold reds, specifically Napa Cabs",
      favorite_cuisines: ["Italian", "French"],
      atmosphere_preference: "Dimly lit, romantic, intimate",
    };
    await setPersonalPreferences(user_id, sarahPrefs);
    return sarahPrefs;
  }
  
  return data;
}

export async function setPersonalPreferences(user_id: string, preferences: PersonalPreferences["preferences"]): Promise<void> {
  await cache.set(`${PREFERENCES_PREFIX}${user_id}`, preferences, 86400 * 30); // 30 days
}
