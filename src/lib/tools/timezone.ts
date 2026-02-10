import { z } from "zod";
import { Tool, ToolResult } from "./types";

const TimezoneParams = z.object({
  time: z.string().optional().description("ISO time string, defaults to now"),
  from_tz: z.string().description("Source timezone (e.g., 'America/New_York')"),
  to_tz: z.string().description("Target timezone (e.g., 'Europe/London')"),
});

type Params = z.infer<typeof TimezoneParams>;

export const timezoneTool: Tool<Params> = {
  definition: {
    name: "convert_timezone",
    description: "Converts time between different timezones.",
    parameters: TimezoneParams,
    requires_confirmation: false,
  },
  execute: async (params: Params): Promise<ToolResult> => {
    try {
      const date = params.time ? new Date(params.time) : new Date();
      
      const formatter = new Intl.DateTimeFormat([], {
        timeZone: params.to_tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      return {
        success: true,
        result: {
          original_time: date.toISOString(),
          converted_time: formatter.format(date),
          target_timezone: params.to_tz
        }
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
};
