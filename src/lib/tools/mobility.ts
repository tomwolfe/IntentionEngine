import { z } from "zod";
import { ToolDefinitionMetadata, ToolParameter } from "./types";

export const MobilityRequestSchema = z.object({
  service: z.enum(["uber", "tesla", "lyft"]).describe("The mobility service to use."),
  pickup_location: z.string().describe("The starting point for the ride."),
  destination_location: z.string().describe("The destination for the ride."),
  ride_type: z.string().optional().describe("The type of ride (e.g., 'UberX', 'Model S').")
});

export const RouteEstimateSchema = z.object({
  origin: z.string().describe("The starting location."),
  destination: z.string().describe("The destination location."),
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
    type: "string",
    description: "The starting point for the ride.",
    required: true
  },
  {
    name: "destination_location",
    type: "string",
    description: "The destination for the ride.",
    required: true
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
    type: "string",
    description: "The starting location.",
    required: true
  },
  {
    name: "destination",
    type: "string",
    description: "The destination location.",
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
  console.log(`Requesting ${service} from ${pickup_location} to ${destination_location}...`);
  
  try {
    // Placeholder for actual mobility API integration
    // In production, this would integrate with Uber API, Tesla API, etc.
    // const apiKey = process.env.MOBILITY_API_KEY; // Placeholder for API key
    
    return {
      success: true,
      result: {
        status: "requested",
        service: service,
        pickup: pickup_location,
        destination: destination_location,
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
  console.log(`Getting route estimate from ${origin} to ${destination} via ${travel_mode}...`);
  
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
        origin: origin,
        destination: destination,
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
