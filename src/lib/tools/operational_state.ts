import { z } from "zod";
import { redis } from "../redis-client";
import { ToolDefinitionMetadata } from "./types";

export const LiveStateSchema = z.object({
  restaurant_id: z.string().describe("The unique identifier for the restaurant."),
});

export type LiveStateParams = z.infer<typeof LiveStateSchema>;

export const liveStateReturnSchema = {
  live_data: "object",
  message: "string"
};

/**
 * Fetches the live operational state of a restaurant (e.g., table statuses).
 */
export async function get_live_operational_state(params: LiveStateParams): Promise<{ success: boolean; result?: any; error?: string }> {
  const validated = LiveStateSchema.safeParse(params);
  if (!validated.success) {
    return { success: false, error: "Invalid parameters: " + JSON.stringify(validated.error.format()) };
  }

  const { restaurant_id } = validated.data;
  const key = `state:${restaurant_id}:tables`;

  try {
    const liveData = await redis.hgetall(key);
    
    if (!liveData || Object.keys(liveData).length === 0) {
      return {
        success: true,
        result: {
          live_data: {},
          message: "No live operational data available for this restaurant."
        }
      };
    }

    // Parse values back from JSON strings
    const parsedData: Record<string, any> = {};
    for (const [tableId, value] of Object.entries(liveData)) {
      parsedData[tableId] = typeof value === 'string' ? JSON.parse(value) : value;
    }

    return {
      success: true,
      result: {
        live_data: parsedData,
        message: "Live operational state retrieved successfully."
      }
    };
  } catch (error: any) {
    console.error("[Tool: get_live_operational_state] Error:", error);
    return { success: false, error: error.message };
  }
}

export const getLiveOperationalStateToolDefinition: ToolDefinitionMetadata = {
  name: "get_live_operational_state",
  version: "1.0.0",
  description: "Authorized to access real-time operational data for a restaurant. Provides live status updates on tables (vacant, occupied, dirty) to assist with precise booking and floor management.",
  inputSchema: {
    type: "object",
    properties: {
      restaurant_id: { type: "string", description: "The unique identifier for the restaurant." }
    },
    required: ["restaurant_id"]
  },
  return_schema: liveStateReturnSchema,
  timeout_ms: 10000,
  requires_confirmation: false,
  category: "data",
  rate_limits: {
    requests_per_minute: 30,
    requests_per_hour: 500
  }
};
