import { z } from "zod";
import { ToolDefinition } from "./types";
import { geocode_location, search_restaurant, GeocodeSchema, SearchRestaurantSchema } from "./location_search";
import { add_calendar_event, AddCalendarEventSchema } from "./calendar";
import { mobility_request, get_route_estimate, MobilityRequestSchema, RouteEstimateSchema } from "./mobility";
import { reserve_table, TableReservationSchema } from "./booking";
import { send_comm, CommunicationSchema } from "./communication";
import { get_weather, WeatherSchema } from "./context";
import { RestaurantResultSchema } from "../schema";

export const TOOLS: Map<string, ToolDefinition> = new Map([
  ["geocode_location", {
    name: "geocode_location",
    description: "Converts a city or place name to lat/lon coordinates.",
    parameters: GeocodeSchema,
    responseSchema: z.object({
      lat: z.number(),
      lon: z.number()
    }),
    execute: geocode_location
  }],
  ["search_restaurant", {
    name: "search_restaurant",
    description: "Searches for highly-rated restaurants nearby or in a specific location.",
    parameters: SearchRestaurantSchema,
    responseSchema: z.array(RestaurantResultSchema),
    execute: search_restaurant
  }],
  ["add_calendar_event", {
    name: "add_calendar_event",
    description: "Adds an event to the calendar. Can accept multiple events for bulk scheduling.",
    parameters: AddCalendarEventSchema,
    responseSchema: z.object({
      status: z.string(),
      count: z.number(),
      download_url: z.string(),
      events: z.array(z.any())
    }),
    execute: add_calendar_event
  }],
  ["mobility_request", {
    name: "mobility_request",
    description: "For Uber/Tesla integration. Requests a ride from pickup to destination.",
    parameters: MobilityRequestSchema,
    execute: mobility_request
  }],
  ["get_route_estimate", {
    name: "get_route_estimate",
    description: "For drive time and distance between two locations.",
    parameters: RouteEstimateSchema,
    execute: get_route_estimate
  }],
  ["reserve_table", {
    name: "reserve_table",
    description: "To finalize restaurant bookings.",
    parameters: TableReservationSchema,
    execute: reserve_table
  }],
  ["send_comm", {
    name: "send_comm",
    description: "For email/SMS side-effects.",
    parameters: CommunicationSchema,
    execute: send_comm
  }],
  ["get_weather", {
    name: "get_weather",
    description: "For temporal planning context. Gets weather forecast for a location.",
    parameters: WeatherSchema,
    execute: get_weather
  }]
]);

/**
 * Returns a string representation of all available tools for LLM prompting.
 */
export function getToolDefinitions(): string {
  let definitions = "";
  TOOLS.forEach((tool, name) => {
    const params = Object.keys(tool.parameters.shape).join(", ");
    definitions += `- ${name}(${params}): ${tool.description}
`;
  });
  return definitions;
}
