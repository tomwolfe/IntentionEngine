import { z } from "zod";
import { Tool, ToolResult } from "./types";

const CurrencyParams = z.object({
  amount: z.number(),
  from: z.string().length(3),
  to: z.string().length(3),
});

type Params = z.infer<typeof CurrencyParams>;

export const currencyTool: Tool<Params> = {
  definition: {
    name: "convert_currency",
    description: "Converts between different currencies.",
    parameters: CurrencyParams,
    requires_confirmation: false,
  },
  execute: async (params: Params): Promise<ToolResult> => {
    const { amount, from, to } = params;
    try {
      const response = await fetch(`https://open.er-api.com/v6/latest/${from.toUpperCase()}`);
      if (!response.ok) throw new Error(`Currency API error: ${response.statusText}`);
      const data = await response.json();
      
      const rate = data.rates[to.toUpperCase()];
      if (!rate) throw new Error(`Rate for ${to} not found.`);

      return {
        success: true,
        result: {
          amount: amount,
          from: from.toUpperCase(),
          to: to.toUpperCase(),
          result: amount * rate,
          rate: rate,
          last_updated: data.time_last_update_utc
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
};
