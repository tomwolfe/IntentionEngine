import { z } from "zod";
import { Tool, ToolResult } from "./types";

const AddCalendarEventParams = z.object({
  title: z.string(),
  start_time: z.string(),
  end_time: z.string(),
  location: z.string().optional(),
  restaurant_name: z.string().optional(),
  restaurant_address: z.string().optional(),
});

type Params = z.infer<typeof AddCalendarEventParams>;

export const addCalendarEventTool: Tool<Params> = {
  definition: {
    name: "add_calendar_event",
    description: "Generates a calendar event. Include 'restaurant_name' and 'restaurant_address' if this is for a dining event.",
    parameters: AddCalendarEventParams,
    requires_confirmation: true,
  },
  execute: async (params: Params): Promise<ToolResult> => {
    const description = (params.restaurant_name || params.restaurant_address)
      ? `Restaurant: ${params.restaurant_name || 'N/A'}
Address: ${params.restaurant_address || 'N/A'}`
      : "";

    const queryParams = new URLSearchParams({
      title: params.title,
      start: params.start_time,
      end: params.end_time,
      location: params.location || params.restaurant_address || "",
      description: description
    });

    return {
      success: true,
      result: {
        status: "ready",
        download_url: `/api/download-ics?${queryParams.toString()}`
      }
    };
  }
};
