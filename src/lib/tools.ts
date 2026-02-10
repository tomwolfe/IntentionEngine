import { RestaurantResultSchema } from "./schema";

export interface ToolResult<T = any> {
  success: boolean;
  result?: T;
  error?: string;
  reasoning?: string;
  requiresConfirmation?: boolean;
  draft?: boolean;
}

export async function search_restaurant(params: { 
  cuisine?: string; 
  lat: number; 
  lon: number 
}): Promise<ToolResult> {
  const { cuisine, lat, lon } = params;
  console.log(`Searching for ${cuisine || 'restaurants'} near ${lat}, ${lon}...`);

  try {
    const query = cuisine 
      ? `
        [out:json][timeout:25];
        (
          nwr["amenity"="restaurant"]["cuisine"~"${cuisine}",i](around:10000,${lat},${lon});
          nwr["amenity"="restaurant"](around:5000,${lat},${lon});
        );
        out center 10;
      `
      : `
        [out:json][timeout:25];
        nwr["amenity"="restaurant"](around:10000,${lat},${lon});
        out center 10;
      `;

    const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const overpassRes = await fetch(overpassUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    
    if (!overpassRes.ok) {
      throw new Error(`Overpass API error: ${overpassRes.statusText}`);
    }

    const overpassData = await overpassRes.json();
    let elements = overpassData.elements || [];

    if (cuisine) {
      const regex = new RegExp(cuisine, 'i');
      elements.sort((a: any, b: any) => {
        const aCuisine = a.tags?.cuisine || '';
        const bCuisine = b.tags?.cuisine || '';
        const aMatches = regex.test(aCuisine);
        const bMatches = regex.test(bCuisine);
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
        return 0;
      });
    }

    const results = elements.map((el: any) => {
      const name = el.tags.name || "Unknown Restaurant";
      const addr = [
        el.tags["addr:housenumber"],
        el.tags["addr:street"],
        el.tags["addr:city"]
      ].filter(Boolean).join(" ") || "Address not available";

      const rawResult = {
        name,
        address: addr,
        coordinates: {
          lat: parseFloat(el.lat || el.center?.lat),
          lon: parseFloat(el.lon || el.center?.lon)
        }
      };

      const validated = RestaurantResultSchema.safeParse(rawResult);
      return validated.success ? validated.data : null;
    }).filter(Boolean).slice(0, 5);

    const reasoning = cuisine 
      ? `Selected these restaurants because they match "${cuisine}" cuisine within 10km of your location (${lat.toFixed(4)}, ${lon.toFixed(4)}). Prioritized exact cuisine matches first, then expanded to nearby options.`
      : `Found these restaurants within 10km of your location (${lat.toFixed(4)}, ${lon.toFixed(4)}). Results sorted by proximity and relevance.`;

    return {
      success: true,
      result: results,
      reasoning
    };
  } catch (error: any) {
    console.error("Error in search_restaurant:", error);
    return { success: false, error: error.message };
  }
}

export async function add_calendar_event(params: { 
  title: string; 
  start_time: string; 
  end_time: string; 
  location?: string;
  confirmed?: boolean;
}): Promise<ToolResult> {
  console.log(`Calendar event requested: ${params.title} from ${params.start_time} to ${params.end_time}...`);
  
  const queryParams = new URLSearchParams({
    title: params.title,
    start: params.start_time,
    end: params.end_time,
    location: params.location || ""
  });

  if (!params.confirmed) {
    return {
      success: true,
      draft: true,
      requiresConfirmation: true,
      result: {
        title: params.title,
        start_time: params.start_time,
        end_time: params.end_time,
        location: params.location,
        status: "draft",
        message: "Please confirm to add this event to your calendar."
      },
      reasoning: "Calendar events require user confirmation before being finalized. Review the details and confirm to proceed."
    };
  }

  return {
    success: true,
    result: {
      status: "confirmed",
      download_url: `/api/download-ics?${queryParams.toString()}`
    },
    reasoning: "Event has been confirmed and is ready to be added to your calendar."
  };
}

export async function web_search(params: { 
  query: string; 
  num_results?: number 
}): Promise<ToolResult> {
  const { query, num_results = 5 } = params;
  console.log(`Web search for: ${query}`);

  await new Promise(resolve => setTimeout(resolve, 500));

  const mockResults = [
    {
      title: `Results for "${query}" - Top Information`,
      url: `https://example.com/search?q=${encodeURIComponent(query)}`,
      snippet: `Here you would find comprehensive information about ${query}. This is a simulated search result for demonstration purposes.`
    },
    {
      title: `${query} - Wikipedia Overview`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query.replace(/\s+/g, '_'))}`,
      snippet: `An encyclopedia entry covering the history, significance, and key facts about ${query}.`
    },
    {
      title: `Latest News About ${query}`,
      url: `https://news.example.com/${encodeURIComponent(query)}`,
      snippet: `Recent developments and updates related to ${query}. Stay informed with the latest headlines.`
    },
    {
      title: `${query} - Expert Guide & Resources`,
      url: `https://guides.example.com/${encodeURIComponent(query)}`,
      snippet: `A comprehensive guide with tips, best practices, and expert advice on ${query}.`
    },
    {
      title: `Community Discussion: ${query}`,
      url: `https://forum.example.com/t/${encodeURIComponent(query)}`,
      snippet: `Join the conversation! See what others are saying about ${query} and share your thoughts.`
    }
  ];

  return {
    success: true,
    result: mockResults.slice(0, num_results),
    reasoning: `Performed a simulated web search for "${query}" and retrieved ${Math.min(num_results, mockResults.length)} relevant results covering general information, encyclopedia entries, news, guides, and community discussions.`
  };
}

export async function get_weather(params: { 
  location: string; 
  days?: number 
}): Promise<ToolResult> {
  const { location, days = 3 } = params;
  console.log(`Getting weather for: ${location}`);

  await new Promise(resolve => setTimeout(resolve, 300));

  const conditions = ['Sunny', 'Partly Cloudy', 'Cloudy', 'Light Rain', 'Clear Skies'];
  const forecast = Array.from({ length: Math.min(days, 7) }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    const tempHigh = Math.floor(Math.random() * 15) + 15;
    const tempLow = tempHigh - Math.floor(Math.random() * 10) - 5;
    
    return {
      date: date.toISOString().split('T')[0],
      condition,
      temperature: {
        high: tempHigh,
        low: tempLow,
        unit: '°C'
      },
      humidity: Math.floor(Math.random() * 40) + 40,
      wind_speed: Math.floor(Math.random() * 20) + 5
    };
  });

  return {
    success: true,
    result: {
      location,
      current: forecast[0],
      forecast: forecast.slice(1)
    },
    reasoning: `Generated a simulated ${days}-day weather forecast for ${location} based on typical seasonal patterns. This is a mock implementation for demonstration purposes.`
  };
}

export const TOOLS: Record<string, Function> = {
  search_restaurant,
  add_calendar_event,
  web_search,
  get_weather,
};

export async function executeTool(tool_name: string, parameters: any): Promise<ToolResult> {
  const tool = TOOLS[tool_name];
  if (!tool) {
    throw new Error(`Tool ${tool_name} not found`);
  }
  return await tool(parameters);
}
