import { GeocodingProvider, GeocodingResult } from "./types";

export class NominatimProvider implements GeocodingProvider {
  name = "nominatim";

  async geocode(location: string): Promise<GeocodingResult | null> {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'IntentionEngine/1.0'
        }
      });
      const data = await response.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon),
          address: data[0].display_name
        };
      }
      return null;
    } catch (error) {
      console.error("Nominatim geocoding error:", error);
      return null;
    }
  }
}
