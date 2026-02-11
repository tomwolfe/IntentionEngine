import { z } from "zod";
import { ToolDefinition } from "./types";
import { geocode_location, search_restaurant, GeocodeSchema, SearchRestaurantSchema } from "./location_search";
import { add_calendar_event, AddCalendarEventSchema } from "./calendar";
import { 
  mobility_request, 
  get_route_estimate, 
  mobilityRequestToolDefinition,
  routeEstimateToolDefinition
} from "./mobility";
import { 
  reserve_table, 
  reserveTableToolDefinition 
} from "./booking";
import { 
  send_comm, 
  sendCommToolDefinition 
} from "./communication";
import { 
  get_weather, 
  getWeatherToolDefinition 
} from "./context";
import { RestaurantResultSchema } from "../schema";

/**
 * Tool registry with complete ToolDefinition metadata for all tools.
 * Each tool is registered with its full definition including parameters,
 * return schema, category, and confirmation requirements.
 */
export const TOOLS: Map<string, ToolDefinition> = new Map([
  ["geocode_location", {
    name: "geocode_location",
    version: "1.0.0",
    description: "Converts a city or place name to lat/lon coordinates.",
    parameters: [
      {
        name: "location",
        type: "string",
        description: "The city, neighborhood, or specific place name to geocode. Use 'nearby' for the user's current area.",
        required: true
      },
      {
        name: "userLocation",
        type: "object",
        description: "The user's current GPS coordinates for biasing search results.",
        required: false
      }
    ],
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
    description: "Searches for highly-rated restaurants nearby or in a specific location.",
    parameters: [
      {
        name: "cuisine",
        type: "string",
        description: "The type of cuisine to search for (e.g., 'Italian', 'Sushi', 'Burgers').",
        required: false
      },
      {
        name: "lat",
        type: "number",
        description: "Latitude for the search center.",
        required: false
      },
      {
        name: "lon",
        type: "number",
        description: "Longitude for the search center.",
        required: false
      },
      {
        name: "location",
        type: "string",
        description: "A text-based location (e.g., 'Soho, London') to search near if coordinates are not provided.",
        required: false
      },
      {
        name: "userLocation",
        type: "object",
        description: "The user's current GPS coordinates for proximity biasing.",
        required: false
      }
    ],
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
    description: "Adds an event to the calendar. Can accept multiple events for bulk scheduling.",
    parameters: [
      {
        name: "events",
        type: "array",
        description: "An array of one or more calendar events to schedule.",
        required: true
      }
    ],
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
  ["mobility_request", {
    ...mobilityRequestToolDefinition,
    execute: mobility_request
  }],
  ["get_route_estimate", {
    ...routeEstimateToolDefinition,
    execute: get_route_estimate
  }],
  ["reserve_table", {
    ...reserveTableToolDefinition,
    execute: reserve_table
  }],
  ["send_comm", {
    ...sendCommToolDefinition,
    execute: send_comm
  }],
  ["get_weather", {
    ...getWeatherToolDefinition,
    execute: get_weather
  }]
]);

/**
 * Returns a string representation of all available tools for LLM prompting.
 */
export function getToolDefinitions(): string {
  let definitions = "";
  TOOLS.forEach((tool, name) => {
    const params = tool.parameters.map(p => p.name).join(", ");
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
