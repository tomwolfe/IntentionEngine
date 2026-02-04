/**
 * Deterministic routing logic to decide between client-side and server-side processing.
 * 
 * Criteria for simple tasks (client-side):
 * 1. Message length < 100 characters
 * 2. Absence of tool-related keywords: 'search', 'restaurant', 'calendar', 'event', 'geocode', 'add', 'plan'
 */
export const detectSimpleTask = (text: string) => {
  const keywords = ['search', 'restaurant', 'calendar', 'event', 'geocode', 'add', 'plan'];
  const isShort = text.length < 100;
  const hasNoKeywords = !keywords.some(kw => text.toLowerCase().includes(kw));
  return isShort && hasNoKeywords;
};
