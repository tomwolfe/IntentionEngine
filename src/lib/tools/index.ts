import { ToolRegistry } from "./types";
import { searchRestaurantTool } from "./search_restaurant";
import { addCalendarEventTool } from "./add_calendar_event";
import { geocodeLocationTool } from "./geocode_location";
import { weatherTool } from "./weather";
import { wikipediaTool } from "./wikipedia";
import { unitConversionTool } from "./unit_conversion";
import { timezoneTool } from "./timezone";
import { currencyTool } from "./currency";

export * from "./types";

export const TOOLS: ToolRegistry = {
  [searchRestaurantTool.definition.name]: searchRestaurantTool,
  [addCalendarEventTool.definition.name]: addCalendarEventTool,
  [geocodeLocationTool.definition.name]: geocodeLocationTool,
  [weatherTool.definition.name]: weatherTool,
  [wikipediaTool.definition.name]: wikipediaTool,
  [unitConversionTool.definition.name]: unitConversionTool,
  [timezoneTool.definition.name]: timezoneTool,
  [currencyTool.definition.name]: currencyTool,
};

export async function executeTool(tool_name: string, parameters: any) {
  const tool = TOOLS[tool_name];
  if (!tool) {
    throw new Error(`Tool ${tool_name} not found`);
  }
  return await tool.execute(parameters);
}

export function getToolDefinitions() {
  return Object.values(TOOLS).map(tool => tool.definition);
}
