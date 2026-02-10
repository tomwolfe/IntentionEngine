import { SearchProvider, SearchResult } from "./types";

export class OverpassProvider implements SearchProvider {
  name = "overpass";

  async search(params: {
    cuisine?: string;
    lat: number;
    lon: number;
    radius?: number;
    limit?: number;
  }): Promise<SearchResult[]> {
    const { cuisine, lat, lon, radius = 10000, limit = 10 } = params;

    const query = cuisine 
      ? `
        [out:json][timeout:10];
        (
          nwr["amenity"="restaurant"]["cuisine"~"${cuisine}",i](around:${radius},${lat},${lon});
          nwr["amenity"="restaurant"](around:${radius / 2},${lat},${lon});
        );
        out center ${limit};
      `
      : `
        [out:json][timeout:10];
        nwr["amenity"="restaurant"](around:${radius},${lat},${lon});
        out center ${limit};
      `;

    const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
    
    try {
      const response = await fetch(overpassUrl);
      if (!response.ok) throw new Error(`Overpass API error: ${response.statusText}`);

      const data = await response.json();
      const elements = data.elements || [];

      return elements.map((el: any) => ({
        name: el.tags.name || "Unknown Restaurant",
        address: [
          el.tags["addr:housenumber"],
          el.tags["addr:street"],
          el.tags["addr:city"]
        ].filter(Boolean).join(" ") || "Address not available",
        coordinates: {
          lat: parseFloat(el.lat || el.center?.lat),
          lon: parseFloat(el.lon || el.center?.lon)
        },
        metadata: el.tags
      }));
    } catch (error) {
      console.error("Overpass search error:", error);
      return [];
    }
  }
}
