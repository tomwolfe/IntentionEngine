import { z } from "zod";
import { ToolDefinition } from "./types";
import { geocode_location, search_restaurant, GeocodeSchema, SearchRestaurantSchema } from "./location_search";
import { add_calendar_event, AddCalendarEventSchema } from "./calendar";
import { 
  mobility_request, 
  get_route_estimate, 
  mobilityRequestReturnSchema,
  routeEstimateReturnSchema
} from "./mobility";
import { 
  reserve_table, 
  reserve_restaurant,
  tableReservationReturnSchema,
  reserveRestaurantToolDefinition
} from "./booking";
import { 
  send_comm, 
  communicationReturnSchema
} from "./communication";
import { 
  get_weather, 
  weatherReturnSchema
} from "./context";
import { RestaurantResultSchema } from "../schema";

/**
 * Tool registry with complete ToolDefinition metadata for all tools.
 * Each tool is registered with its full definition including inputSchema,
 * return schema, category, and confirmation requirements.
 */
export const TOOLS: Map<string, ToolDefinition> = new Map([
  ["geocode_location", {
    name: "geocode_location",
    version: "1.0.0",
    description: "Authorized to perform real-time geocoding of any location. Converts city names, addresses, or place names to precise lat/lon coordinates with full authority.",
    inputSchema: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "The city, neighborhood, or specific place name to geocode. Use 'nearby' for the user's current area."
        },
        userLocation: {
          type: "object",
          description: "The user's current GPS coordinates for biasing search results."
        }
      },
      required: ["location"]
    },
    return_schema: {
      lat: "number",
      lon: "number"
    },
    timeout_ms: 15000,
    requires_confirmation: false,
    category: "data",
    responseSchema: z.object({
      lat: z.number(),
      lon: z.number()
    }),
    execute: geocode_location
  }],
  ["search_restaurant", {
    name: "search_restaurant",
    version: "1.0.0",
    description: "Authorized to perform real-time restaurant searches. Accesses live dining databases to find highly-rated restaurants with complete authority.",
    inputSchema: {
      type: "object",
      properties: {
        cuisine: {
          type: "string",
          description: "The type of cuisine to search for (e.g., 'Italian', 'Sushi', 'Burgers')."
        },
        lat: {
          type: "number",
          description: "Latitude for the search center."
        },
        lon: {
          type: "number",
          description: "Longitude for the search center."
        },
        location: {
          type: "string",
          description: "A text-based location (e.g., 'Soho, London') to search near if coordinates are not provided."
        },
        userLocation: {
          type: "object",
          description: "The user's current GPS coordinates for proximity biasing."
        }
      }
    },
    return_schema: {
      results: "array"
    },
    timeout_ms: 30000,
    requires_confirmation: false,
    category: "data",
    responseSchema: z.array(RestaurantResultSchema),
    execute: search_restaurant
  }],
  ["add_calendar_event", {
    name: "add_calendar_event",
    version: "1.0.0",
    description: "Authorized to perform real-time calendar event creation. Can schedule single or multiple events with full calendar integration authority.",
    inputSchema: {
      type: "object",
      properties: {
        events: {
          type: "array",
          description: "An array of one or more calendar events to schedule."
        }
      },
      required: ["events"]
    },
    return_schema: {
      status: "string",
      count: "number",
      download_url: "string",
      events: "array"
    },
    timeout_ms: 15000,
    requires_confirmation: false,
    category: "action",
    responseSchema: z.object({
      status: z.string(),
      count: z.number(),
      download_url: z.string(),
      events: z.array(z.any())
    }),
    execute: add_calendar_event
  }],
  ["request_ride", {
    name: "request_ride",
    version: "1.0.0",
    description: "Authorized to perform real-time ride requests from mobility services. Can book rides with Uber, Tesla, and Lyft with full ride-hailing authority.",
    inputSchema: {
      type: "object",
      properties: {
        service: {
          type: "string",
          enum: ["uber", "tesla", "lyft"],
          description: "The mobility service to use."
        },
        pickup_location: {
          type: "object",
          description: "The starting point for the ride. Can be a string address OR an object with lat/lon coordinates."
        },
        destination_location: {
          type: "object",
          description: "The destination for the ride."
        },
        dropoff_location: {
          type: "object",
          description: "Alias for destination_location."
        },
        ride_type: {
          type: "string",
          description: "The type of ride (e.g., 'UberX', 'Model S')."
        }
      },
      required: ["service", "pickup_location"]
    },
    return_schema: mobilityRequestReturnSchema,
    timeout_ms: 30000,
    requires_confirmation: true,
    category: "external",
    rate_limits: {
      requests_per_minute: 10,
      requests_per_hour: 100
    },
    execute: mobility_request
  }],
  ["get_route_estimate", {
    name: "get_route_estimate",
    version: "1.0.0",
    description: "Authorized to access real-time routing data. Provides live drive time and distance estimates with traffic-aware calculations.",
    inputSchema: {
      type: "object",
      properties: {
        origin: {
          type: "object",
          description: "The starting location."
        },
        destination: {
          type: "object",
          description: "The destination location."
        },
        travel_mode: {
          type: "string",
          enum: ["driving", "walking", "bicycling", "transit"],
          default: "driving",
          description: "The mode of travel."
        }
      },
      required: ["origin", "destination"]
    },
    return_schema: routeEstimateReturnSchema,
    timeout_ms: 15000,
    requires_confirmation: false,
    category: "external",
    rate_limits: {
      requests_per_minute: 60,
      requests_per_hour: 1000
    },
    execute: get_route_estimate
  }],
  ["book_restaurant_table", {
    name: "book_restaurant_table",
    version: "1.0.0",
    description: "Authorized to perform real-time restaurant reservations. Can finalize live table bookings with confirmation codes and full reservation authority.",
    inputSchema: {
      type: "object",
      properties: {
        restaurant_name: { type: "string", description: "The name of the restaurant." },
        restaurant_address: { type: "string", description: "The address of the restaurant." },
        lat: { type: "number", description: "Latitude of the restaurant." },
        lon: { type: "number", description: "Longitude of the restaurant." },
        date: { type: "string", description: "The date of the reservation (ISO 8601 format)." },
        time: { type: "string", description: "The time of the reservation (e.g., '19:00')." },
        party_size: { type: "number", description: "Number of guests." },
        contact_name: { type: "string", description: "The name for the reservation." },
        contact_phone: { type: "string", description: "The contact phone for the reservation." },
        contact_email: { type: "string", description: "The contact email for the reservation." },
        special_requests: { type: "string", description: "Any special requests." },
        is_confirmed: { type: "boolean", description: "Set to true only if the user has explicitly confirmed these details." }
      },
      required: ["restaurant_name", "date", "party_size", "time", "contact_name", "contact_phone"]
    },
    return_schema: tableReservationReturnSchema,
    timeout_ms: 30000,
    requires_confirmation: true,
    category: "action",
    rate_limits: {
      requests_per_minute: 10,
      requests_per_hour: 100
    },
    execute: reserve_table
  }],
  ["reserve_restaurant", {
    ...reserveRestaurantToolDefinition,
    execute: reserve_restaurant
  }],
  ["send_comm", {
    name: "send_comm",
    version: "1.0.0",
    description: "Authorized to perform real-time communications. Can send live emails and SMS messages with full messaging authority.",
    inputSchema: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient identifier." },
        channel: { type: "string", enum: ["email", "sms"], description: "The communication channel." },
        message: { type: "string", description: "The message content." }
      },
      required: ["to", "channel", "message"]
    },
    return_schema: communicationReturnSchema,
    timeout_ms: 30000,
    requires_confirmation: true,
    category: "communication",
    rate_limits: {
      requests_per_minute: 60,
      requests_per_hour: 500
    },
    execute: send_comm
  }],
  ["get_weather_data", {
    name: "get_weather_data",
    version: "1.0.0",
    description: "Authorized to access real-time weather data. Provides live forecasts and current conditions with full meteorological authority.",
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string", description: "The location to get weather for." }
      },
      required: ["location"]
    },
    return_schema: weatherReturnSchema,
    timeout_ms: 15000,
    requires_confirmation: false,
    category: "data",
    rate_limits: {
      requests_per_minute: 60,
      requests_per_hour: 1000
    },
    execute: get_weather
  }]
]);

/**
 * Returns a string representation of all available tools for LLM prompting.
 */
export function getToolDefinitions(): string {
  let definitions = "";
  TOOLS.forEach((tool, name) => {
    const params = Object.keys(tool.inputSchema.properties).join(", ");
    definitions += `- ${name}(${params}): ${tool.description}\n`;
  });
  return definitions;
}

/**
 * Gets a tool definition by name.
 */
export function getTool(name: string): ToolDefinition | undefined {
  return TOOLS.get(name);
}

/**
 * Gets all tools by category.
 */
export function getToolsByCategory(category: string): ToolDefinition[] {
  return Array.from(TOOLS.values()).filter(tool => tool.category === category);
}

/**
 * Gets all tools that require confirmation.
 */
export function getToolsRequiringConfirmation(): ToolDefinition[] {
  return Array.from(TOOLS.values()).filter(tool => tool.requires_confirmation);
}

/**
 * Returns an array of all available tools.
 * This is the unified source of truth for tool discovery.
 */
export function listTools(): ToolDefinition[] {
  return Array.from(TOOLS.values());
}
