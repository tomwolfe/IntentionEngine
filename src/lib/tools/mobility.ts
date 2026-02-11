import { z } from "zod";
import { ToolDefinitionMetadata, ToolParameter } from "./types";

/**
 * Unified Location Schema - Accepts both string addresses and coordinate objects
 * This schema handles the flexibility needed for LLM-generated location data
 */
export const UnifiedLocationSchema = z.union([
  z.string().describe("A string address or location name (e.g., '123 Main St', 'Airport', 'Downtown')"),
  z.object({
    lat: z.number().describe("Latitude coordinate"),
    lon: z.number().describe("Longitude coordinate"),
    address: z.string().optional().describe("Optional human-readable address")
  }).describe("A coordinate object with lat/lon and optional address")
]);

export type UnifiedLocation = z.infer<typeof UnifiedLocationSchema>;

/**
 * Helper function to normalize unified location to string format
 */
export function normalizeLocation(location: UnifiedLocation): string {
  if (typeof location === "string") {
    return location;
  }
  // Convert coordinate object to string format
  if (location.address) {
    return `${location.address} (${location.lat}, ${location.lon})`;
  }
  return `${location.lat}, ${location.lon}`;
}

export const MobilityRequestSchema = z.object({
  service: z.enum(["uber", "tesla", "lyft"]).describe("The mobility service to use."),
  pickup_location: UnifiedLocationSchema.describe("The starting point for the ride (string address or coordinate object with lat/lon)."),
  destination_location: UnifiedLocationSchema.optional().describe("The destination for the ride (string address or coordinate object with lat/lon)."),
  dropoff_location: UnifiedLocationSchema.optional().describe("Alias for destination_location. Use this if the LLM provides dropoff_location instead of destination_location."),
  ride_type: z.string().optional().describe("The type of ride (e.g., 'UberX', 'Model S').")
}).refine(data => data.destination_location || data.dropoff_location, {
  message: "Either destination_location or dropoff_location must be provided",
  path: ["destination_location"]
}).transform(data => ({
  ...data,
  destination_location: (data.destination_location || data.dropoff_location)!
}));

export const RouteEstimateSchema = z.object({
  origin: UnifiedLocationSchema.describe("The starting location (string address or coordinate object with lat/lon)."),
  destination: UnifiedLocationSchema.describe("The destination location (string address or coordinate object with lat/lon)."),
  travel_mode: z.enum(["driving", "walking", "bicycling", "transit"]).default("driving").describe("The mode of travel.")
});

export type MobilityRequestParams = z.infer<typeof MobilityRequestSchema>;
export type RouteEstimateParams = z.infer<typeof RouteEstimateSchema>;

// Parameters for mobility_request tool
export const mobilityRequestToolParameters: ToolParameter[] = [
  {
    name: "service",
    type: "string",
    description: "The mobility service to use.",
    required: true,
    enum_values: ["uber", "tesla", "lyft"]
  },
  {
    name: "pickup_location",
    type: "object",
    description: "The starting point for the ride. Can be a string address OR an object with lat/lon coordinates: {lat: number, lon: number, address?: string}",
    required: true
  },
  {
    name: "destination_location",
    type: "object",
    description: "The destination for the ride. Can be a string address OR an object with lat/lon coordinates: {lat: number, lon: number, address?: string}. Exactly one of destination_location or dropoff_location must be provided.",
    required: false
  },
  {
    name: "dropoff_location",
    type: "object",
    description: "Alias for destination_location. Alternative parameter name accepted for flexibility. Exactly one of destination_location or dropoff_location must be provided.",
    required: false
  },
  {
    name: "ride_type",
    type: "string",
    description: "The type of ride (e.g., 'UberX', 'Model S').",
    required: false
  }
];

// Return schema for mobility_request tool
export const mobilityRequestReturnSchema = {
  status: "string",
  service: "string",
  pickup: "string",
  destination: "string",
  estimated_arrival: "string"
};

// Parameters for get_route_estimate tool
export const routeEstimateToolParameters: ToolParameter[] = [
  {
    name: "origin",
    type: "object",
    description: "The starting location. Can be a string address OR an object with lat/lon coordinates: {lat: number, lon: number, address?: string}",
    required: true
  },
  {
    name: "destination",
    type: "object",
    description: "The destination location. Can be a string address OR an object with lat/lon coordinates: {lat: number, lon: number, address?: string}",
    required: true
  },
  {
    name: "travel_mode",
    type: "string",
    description: "The mode of travel.",
    required: false,
    default_value: "driving",
    enum_values: ["driving", "walking", "bicycling", "transit"]
  }
];

// Return schema for get_route_estimate tool
export const routeEstimateReturnSchema = {
  origin: "string",
  destination: "string",
  distance_km: "number",
  duration_minutes: "number",
  traffic_status: "string"
};

export async function mobility_request(params: MobilityRequestParams): Promise<{ success: boolean; result?: any; error?: string }> {
  const validated = MobilityRequestSchema.safeParse(params);
  if (!validated.success) {
    return { success: false, error: "Invalid parameters: " + validated.error.message };
  }

  const { service, pickup_location, destination_location, ride_type } = validated.data;

  // Normalize locations to string format for API compatibility
  const normalizedPickup = normalizeLocation(pickup_location);
  const normalizedDestination = normalizeLocation(destination_location);

  console.log(`Requesting ${service} from ${normalizedPickup} to ${normalizedDestination}...`);

  try {
    // Placeholder for actual mobility API integration
    // In production, this would integrate with Uber API, Tesla API, etc.
    // const apiKey = process.env.MOBILITY_API_KEY; // Placeholder for API key

    return {
      success: true,
      result: {
        status: "requested",
        service: service,
        pickup: normalizedPickup,
        destination: normalizedDestination,
        estimated_arrival: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function get_route_estimate(params: RouteEstimateParams): Promise<{ success: boolean; result?: any; error?: string }> {
  const validated = RouteEstimateSchema.safeParse(params);
  if (!validated.success) {
    return { success: false, error: "Invalid parameters: " + validated.error.message };
  }

  const { origin, destination, travel_mode } = validated.data;

  // Normalize locations to string format for API compatibility
  const normalizedOrigin = normalizeLocation(origin);
  const normalizedDestination = normalizeLocation(destination);

  console.log(`Getting route estimate from ${normalizedOrigin} to ${normalizedDestination} via ${travel_mode}...`);

  try {
    // Placeholder for actual routing API integration
    // In production, this would integrate with Google Maps API, Mapbox, etc.
    // const apiKey = process.env.ROUTING_API_KEY; // Placeholder for API key

    // Simulated response based on travel mode
    const distanceMultiplier = travel_mode === "walking" ? 1 : travel_mode === "bicycling" ? 1 : 1;
    const durationMultiplier = travel_mode === "walking" ? 12 : travel_mode === "bicycling" ? 4 : travel_mode === "transit" ? 2 : 1.5;

    return {
      success: true,
      result: {
        origin: normalizedOrigin,
        destination: normalizedDestination,
        distance_km: parseFloat((12.5 * distanceMultiplier).toFixed(1)),
        duration_minutes: Math.round(25 * durationMultiplier),
        traffic_status: travel_mode === "driving" ? "moderate" : "n/a"
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export const mobilityRequestToolDefinition: ToolDefinitionMetadata = {
  name: "mobility_request",
  version: "1.0.0",
  description: "Requests a ride from a mobility service (Uber, Tesla, Lyft) from pickup to destination.",
  parameters: mobilityRequestToolParameters,
  return_schema: mobilityRequestReturnSchema,
  timeout_ms: 30000,
  requires_confirmation: true,
  category: "external",
  rate_limits: {
    requests_per_minute: 10,
    requests_per_hour: 100
  }
};

export const routeEstimateToolDefinition: ToolDefinitionMetadata = {
  name: "get_route_estimate",
  version: "1.0.0",
  description: "Gets drive time and distance estimates between two locations for various travel modes.",
  parameters: routeEstimateToolParameters,
  return_schema: routeEstimateReturnSchema,
  timeout_ms: 15000,
  requires_confirmation: false,
  category: "external",
  rate_limits: {
    requests_per_minute: 60,
    requests_per_hour: 1000
  }
};
