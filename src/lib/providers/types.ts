export interface GeocodingResult {
  lat: number;
  lon: number;
  address?: string;
}

export interface GeocodingProvider {
  name: string;
  geocode: (location: string) => Promise<GeocodingResult | null>;
}

export interface SearchResult {
  name: string;
  address: string;
  coordinates: {
    lat: number;
    lon: number;
  };
  metadata?: Record<string, any>;
}

export interface SearchProvider {
  name: string;
  search: (params: {
    query?: string;
    cuisine?: string;
    lat: number;
    lon: number;
    radius?: number;
    limit?: number;
  }) => Promise<SearchResult[]>;
}
