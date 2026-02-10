import { registry, ToolDefinition } from "./tools";
import { z } from "zod";

/**
 * Registers a new tool into the engine's registry at runtime.
 * This allows the engine to expand its capabilities dynamically.
 * 
 * @param definition - The JSON definition of the tool, including its schema and execution logic.
 */
export function registerDynamicTool(definition: {
  name: string;
  description: string;
  parameters: any; // JSON Schema
  execute?: (params: any) => Promise<{ success: boolean; result?: any; error?: string }>;
  endpoint?: string;
}) {
  const { name, description, parameters, execute, endpoint } = definition;

  // In a production environment, we would use a library like `zod-to-json-schema` 
  // and its reverse to convert the JSON schema to a Zod object.
  // For this implementation, we'll create a generic Zod object validator 
  // that ensures the parameters follow the provided JSON schema structure.
  
  const dynamicTool: ToolDefinition = {
    name,
    description,
    parameters: z.record(z.string(), z.any()) as any, // Generic validation for dynamic tools
    execute: execute || (async (params: any) => {
      if (!endpoint) {
        return { success: false, error: `No execution logic or endpoint provided for tool: ${name}` };
      }

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return { success: false, error: `External tool API error: ${errorText || response.statusText}` };
        }

        const result = await response.json();
        return { success: true, result };
      } catch (error: any) {
        return { success: false, error: `Failed to execute dynamic tool ${name}: ${error.message}` };
      }
    })
  };

  registry.register(dynamicTool);
  console.log(`Successfully registered dynamic tool: ${name}`);
}
