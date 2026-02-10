import { GeocodingProvider, SearchProvider } from "./types";
import { NominatimProvider } from "./nominatim";
import { OverpassProvider } from "./overpass";
import { env } from "../config";

export * from "./types";

const GEOCODING_PROVIDERS: Record<string, new () => GeocodingProvider> = {
  nominatim: NominatimProvider,
};

const SEARCH_PROVIDERS: Record<string, new () => SearchProvider> = {
  overpass: OverpassProvider,
};

export function getGeocodingProvider(name?: string): GeocodingProvider {
  const providerName = name || env.GEOCODING_PROVIDER || "nominatim";
  const ProviderClass = GEOCODING_PROVIDERS[providerName];
  if (!ProviderClass) {
    console.warn(`Geocoding provider ${providerName} not found, falling back to nominatim`);
    return new NominatimProvider();
  }
  return new ProviderClass();
}

export function getSearchProvider(name?: string): SearchProvider {
  const providerName = name || env.SEARCH_PROVIDER || "overpass";
  const ProviderClass = SEARCH_PROVIDERS[providerName];
  if (!ProviderClass) {
    console.warn(`Search provider ${providerName} not found, falling back to overpass`);
    return new OverpassProvider();
  }
  return new ProviderClass();
}
