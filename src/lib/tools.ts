import { z } from 'zod';

export const searchRestaurantSchema = z.object({
  cuisine: z.string().describe('Type of cuisine (e.g., Italian, Japanese, Mexican)'),
  location: z.string().describe('City or neighborhood'),
});

export const addCalendarEventSchema = z.object({
  title: z.string().describe('Event title'),
  location: z.string().describe('Full address of the restaurant'),
  startTime: z.string().describe('ISO 8601 datetime string'),
  durationMinutes: z.number().default(120).describe('Event duration in minutes'),
});

export interface Restaurant {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}

export interface CalendarEvent {
  title: string;
  location: string;
  startTime: string;
  durationMinutes: number;
}

const winePairings: Record<string, string> = {
  italian: 'Chianti Classico - A medium-bodied red with bright acidity that cuts through tomato-based sauces.',
  japanese: 'Dry Sake or Pinot Grigio - Clean, crisp profiles that complement delicate flavors without overpowering.',
  mexican: 'Albariño or Rosé - High acidity and bright fruit notes balance spice and richness.',
  french: 'Burgundy Pinot Noir or Sancerre - Classic pairings that respect the cuisine\'s elegance.',
  indian: 'Riesling or Gewürztraminer - Off-dry whites that tame heat while enhancing aromatics.',
  chinese: 'German Riesling or Champagne - Versatile options for diverse flavor profiles.',
  thai: 'Grüner Veltliner - Peppery notes and high acidity match Thai herbs and spice.',
  american: 'Napa Cabernet or Oregon Pinot - Versatile reds for diverse American cuisine.',
  mediterranean: 'Greek Assyrtiko or Lebanese Château Musar - Authentic regional pairings.',
  spanish: 'Rioja or Albariño - Tempranillo\'s earthiness or the crispness of Galician whites.',
  greek: 'Assyrtiko from Santorini - Crisp, mineral-driven, and perfect for Mediterranean dishes.',
  korean: 'Beaujolais or Lambrusco - Light, fruity reds that complement bold, fermented flavors.',
  vietnamese: 'Moschofilero or Torrontés - Aromatic whites that mirror Vietnamese herb intensity.',
  lebanese: 'Lebanese Château Musar or Cinsault-based rosé - Authentic Middle Eastern elegance.',
  brazilian: 'Champagne or Brut Rosé - Bubbles cut through the richness of Brazilian barbecue.',
  default: 'A versatile Pinot Noir or dry Riesling - Both adapt well to a wide range of cuisines.',
};

export function getWinePairing(cuisine: string): string {
  const normalized = cuisine.toLowerCase().trim();
  return winePairings[normalized] || winePairings.default;
}

export async function searchRestaurant(cuisine: string, location: string): Promise<Restaurant> {
  console.log(`[AUDIT] Searching: ${cuisine} in ${location}`);
  
  const query = `
    [out:json];
    area["name"="${location}"]->.searchArea;
    (
      node["amenity"="restaurant"]["cuisine"~"${cuisine}",i](area.searchArea);
      way["amenity"="restaurant"]["cuisine"~"${cuisine}",i](area.searchArea);
    );
    out center;
  `;

  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error('Restaurant search failed');
  }

  const data = await response.json();
  
  if (!data.elements || data.elements.length === 0) {
    throw new Error(`No ${cuisine} restaurants found in ${location}`);
  }

  const place = data.elements[0];
  const tags = place.tags || {};
  
  const result: Restaurant = {
    name: tags.name || `${cuisine} Restaurant`,
    address: tags['addr:street'] 
      ? `${tags['addr:housenumber'] || ''} ${tags['addr:street']}, ${location}`
      : `${location} (exact address TBD)`,
    latitude: place.lat || place.center?.lat || 0,
    longitude: place.lon || place.center?.lon || 0,
  };

  console.log(`[AUDIT] Found: ${result.name} at ${result.address}`);
  return result;
}

export function generateIcsUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    title: event.title,
    location: event.location,
    time: event.startTime,
  });
  return `/api/download-ics?${params.toString()}`;
}

export function generateIcsContent(event: CalendarEvent): string {
  const start = new Date(event.startTime);
  const end = new Date(start.getTime() + event.durationMinutes * 60000);
  
  const formatDate = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//IntentionEngine//Pareto Core//EN
BEGIN:VEVENT
DTSTART:${formatDate(start)}
DTEND:${formatDate(end)}
SUMMARY:${event.title}
LOCATION:${event.location}
DESCRIPTION:Booked via IntentionEngine
END:VEVENT
END:VCALENDAR`;
}
