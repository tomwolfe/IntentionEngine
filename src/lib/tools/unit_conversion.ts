import { z } from "zod";
import { Tool, ToolResult } from "./types";

const UnitConversionParams = z.object({
  value: z.number(),
  from: z.string(),
  to: z.string(),
});

type Params = z.infer<typeof UnitConversionParams>;

// Simple local conversion map
const CONVERSIONS: Record<string, number> = {
  // Length (base: meter)
  "m": 1,
  "km": 1000,
  "cm": 0.01,
  "mm": 0.001,
  "inch": 0.0254,
  "ft": 0.3048,
  "yard": 0.9144,
  "mile": 1609.34,
  // Weight (base: kg)
  "kg": 1,
  "g": 0.001,
  "mg": 0.000001,
  "lb": 0.453592,
  "oz": 0.0283495,
};

export const unitConversionTool: Tool<Params> = {
  definition: {
    name: "convert_units",
    description: "Converts units of measurement (length, weight).",
    parameters: UnitConversionParams,
    requires_confirmation: false,
  },
  execute: async (params: Params): Promise<ToolResult> => {
    const { value, from, to } = params;

    // Handle temperature separately
    if (from === "C" && to === "F") return { success: true, result: (value * 9/5) + 32 };
    if (from === "F" && to === "C") return { success: true, result: (value - 32) * 5/9 };

    const fromFactor = CONVERSIONS[from.toLowerCase()];
    const toFactor = CONVERSIONS[to.toLowerCase()];

    if (fromFactor && toFactor) {
      const result = (value * fromFactor) / toFactor;
      return { success: true, result };
    }

    return { success: false, error: `Conversion from ${from} to ${to} not supported.` };
  }
};
