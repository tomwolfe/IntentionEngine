export const personalContext = {
  user: {
    name: "User",
    preferences: {
      budget: "mid-range",
      timing: "flexible but prefers evening plans"
    }
  },
  contacts: {
    sarah: {
      name: "Sarah",
      preferences: {
        food: ["Italian", "Mediterranean", "Vegetarian options"],
        music: "prefers quiet environments, hates loud music",
        allergies: ["shellfish"],
        occasions: "anniversary coming up",
        dislikes: ["crowded places", "loud restaurants"]
      },
      relationship: "significant other"
    }
  }
};

export const getContactContext = (contactName) => {
  const lowerName = contactName.toLowerCase();
  
  if (lowerName.includes('sarah')) {
    return personalContext.contacts.sarah;
  }
  
  return {
    name: contactName,
    preferences: {}
  };
};