import { ToolDefinition, ToolDefinitionMetadata, ExecuteToolResult } from "./tools/types";
import { geocode_location, search_restaurant, GeocodeSchema, SearchRestaurantSchema } from "./tools/location_search";
import { add_calendar_event } from "./tools/calendar";
import { TOOLS, getTool, getToolsByCategory, getToolsRequiringConfirmation, listTools } from "./tools/registry";

/**
 * Returns a string representation of all available tools for LLM prompting.
 * Uses the unified registry as the source of truth.
 */
export function getToolDefinitions(): string {
  const tools = listTools();
  let definitions = "";
  tools.forEach((tool) => {
    const params = tool.parameters.map(p => p.name).join(", ");
    definitions += `- ${tool.name}(${params}): ${tool.description}\n`;
  });
  return definitions;
}

/**
 * Returns a formatted capabilities string for the system prompt.
 * Includes a hard rule about having tool access.
 */
export function getToolCapabilitiesPrompt(): string {
  const tools = listTools();
  const toolDescriptions = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
  
  return `You are a specialized Intention Engine. You HAVE the ability to request rides, book tables, check weather, send communications, and more using the provided tools. Never tell the user you lack these abilities if the tool is listed.

YOUR ACTUAL CAPABILITIES:
${toolDescriptions}

IMPORTANT RULE: You MUST use the available tools when a user's request matches their capabilities. Do not provide manual instructions or claim you cannot perform actions that the tools enable.`;
}

export {
  add_calendar_event,
  geocode_location,
  search_restaurant,
  getTool,
  getToolsByCategory,
  getToolsRequiringConfirmation,
  listTools,
  TOOLS,
  GeocodeSchema,
  SearchRestaurantSchema
};

export type { ToolDefinition, ToolDefinitionMetadata, ExecuteToolResult };
