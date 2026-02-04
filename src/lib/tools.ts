import { RestaurantResultSchema } from "./schema";

export async function search_restaurant(params: { cuisine?: string; lat: number; lon: number }) {
  const { cuisine, lat, lon } = params;
  console.log(`Searching for ${cuisine || 'restaurants'} near ${lat}, ${lon}...`);

  try {
    // 2. Overpass Query
    // We use nwr (node, way, relation) to capture all restaurant types.
    // We use a union to search for the specific cuisine within 10km AND
    // any restaurant within 5km as a fallback to ensure results are returned.
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
    const overpassRes = await fetch(overpassUrl);
    
    if (!overpassRes.ok) {
      throw new Error(`Overpass API error: ${overpassRes.statusText}`);
    }

    const overpassData = await overpassRes.json();
    let elements = overpassData.elements || [];

    // Prioritize results that match the cuisine if provided
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
    }).filter(Boolean).slice(0, 5); // Limit to top 5

    return {
      success: true,
      result: results
    };
  } catch (error: any) {
    console.error("Error in search_restaurant:", error);
    return { success: false, error: error.message };
  }
}

export async function add_calendar_event(params: { title: string; start_time: string; end_time: string; location?: string }) {
  console.log(`Adding calendar event: ${params.title} from ${params.start_time} to ${params.end_time}...`);
  
  const queryParams = new URLSearchParams({
    title: params.title,
    start: params.start_time,
    end: params.end_time,
    location: params.location || ""
  });

  return {
    success: true,
    result: {
      status: "ready",
      download_url: `/api/download-ics?${queryParams.toString()}`
    }
  };
}

export const TOOLS: Record<string, Function> = {
  search_restaurant,
  add_calendar_event,
};

export async function executeTool(tool_name: string, parameters: any) {
  const tool = TOOLS[tool_name];
  if (!tool) {
    throw new Error(`Tool ${tool_name} not found`);
  }
  return await tool(parameters);
}
