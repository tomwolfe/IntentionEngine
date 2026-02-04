export interface PersonContext {
  name: string;
  relationship: string;
  preferences: {
    cuisine: string[];
    dislikes: string[];
    allergies: string[];
    ambiance: string[];
    notes: string[];
  };
  history: {
    last_meeting?: string;
    favorite_restaurants: string[];
  };
}

export interface UserContext {
  name: string;
  location: string;
  preferences: {
    default_ride_type: string;
    dining_preferences: string[];
    calendar_reminder_default: number;
  };
  contacts: Record<string, PersonContext>;
}

export const personalContext: UserContext = {
  name: "User",
  location: "Current Location",
  preferences: {
    default_ride_type: "Uber Black",
    dining_preferences: ["Italian", "Quiet atmosphere", "Wine bars"],
    calendar_reminder_default: 15
  },
  contacts: {
    sarah: {
      name: "Sarah",
      relationship: "close friend",
      preferences: {
        cuisine: ["Italian", "Mediterranean", "French"],
        dislikes: ["Loud music", "Crowded spaces", "Fast food"],
        allergies: ["Shellfish", "Peanuts"],
        ambiance: ["Quiet", "Intimate", "Wine bar atmosphere"],
        notes: [
          "Prefers restaurants with good wine selection",
          "Enjoys conversation over loud environments",
          "Appreciates attention to dietary restrictions"
        ]
      },
      history: {
        last_meeting: "2 weeks ago",
        favorite_restaurants: ["Bar Italia", "Le Bernardin", "Cafe Mogador"]
      }
    },
    mom: {
      name: "Mom",
      relationship: "family",
      preferences: {
        cuisine: ["American", "Comfort food", "Italian"],
        dislikes: ["Spicy food", "Loud music"],
        allergies: [],
        ambiance: ["Traditional", "Comfortable seating", "Early dining"],
        notes: [
          "Prefers early dinner times (5-6 PM)",
          "Appreciates restaurants with good accessibility",
          "Enjoys familiar, consistent experiences"
        ]
      },
      history: {
        last_meeting: "1 week ago",
        favorite_restaurants: ["The Capital Grille", "Olive Garden", "Local Diner"]
      }
    }
  }
};

export function getContactContext(name: string): PersonContext | null {
  const normalizedName = name.toLowerCase();
  return personalContext.contacts[normalizedName] || null;
}

export function getPersonalContext(): UserContext {
  return personalContext;
}
