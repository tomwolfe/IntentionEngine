import { z } from "zod";
import { Tool, ToolResult } from "./types";
import { getGeocodingProvider } from "../providers";

const GeocodeLocationParams = z.object({
  location: z.string(),
});

type Params = z.infer<typeof GeocodeLocationParams>;

export const geocodeLocationTool: Tool<Params> = {
  definition: {
    name: "geocode_location",
    description: "Converts a city or place name to lat/lon coordinates.",
    parameters: GeocodeLocationParams,
    requires_confirmation: false,
  },
  execute: async (params: Params): Promise<ToolResult> => {
    try {
      const geocoder = getGeocodingProvider();
      const result = await geocoder.geocode(params.location);
      if (result) {
        return { success: true, result };
      }
      return { success: false, error: "Location not found" };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
};
