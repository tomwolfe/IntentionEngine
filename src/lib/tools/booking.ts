import { z } from "zod";
import { ToolDefinitionMetadata, ToolParameter } from "./types";

export const TableReservationSchema = z.object({
  restaurant_name: z.string().describe("The name of the restaurant."),
  party_size: z.number().int().positive().describe("Number of people in the party."),
  reservation_time: z.string().describe("The date and time of the reservation in ISO 8601 format."),
  contact_phone: z.string().optional().describe("Contact phone number for the reservation.")
});

export type TableReservationParams = z.infer<typeof TableReservationSchema>;

export const tableReservationToolParameters: ToolParameter[] = [
  {
    name: "restaurant_name",
    type: "string",
    description: "The name of the restaurant.",
    required: true
  },
  {
    name: "party_size",
    type: "number",
    description: "Number of people in the party.",
    required: true
  },
  {
    name: "reservation_time",
    type: "string",
    description: "The date and time of the reservation in ISO 8601 format.",
    required: true
  },
  {
    name: "contact_phone",
    type: "string",
    description: "Contact phone number for the reservation.",
    required: false
  }
];

export const tableReservationReturnSchema = {
  status: "string",
  confirmation_code: "string",
  restaurant: "string",
  time: "string",
  party_size: "number"
};

export async function reserve_table(params: TableReservationParams): Promise<{ success: boolean; result?: any; error?: string }> {
  const validated = TableReservationSchema.safeParse(params);
  if (!validated.success) {
    return { success: false, error: "Invalid parameters: " + validated.error.message };
  }
  
  const { restaurant_name, party_size, reservation_time, contact_phone } = validated.data;
  console.log(`Reserving table for ${party_size} at ${restaurant_name} for ${reservation_time}...`);
  
  try {
    // Placeholder for actual booking API integration
    // In production, this would integrate with OpenTable, Resy, or restaurant-specific APIs
    // const apiKey = process.env.BOOKING_API_KEY; // Placeholder for API key
    
    // Generate a confirmation code
    const confirmationCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    
    return {
      success: true,
      result: {
        status: "confirmed",
        confirmation_code: confirmationCode,
        restaurant: restaurant_name,
        time: reservation_time,
        party_size: party_size
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export const reserveTableToolDefinition: ToolDefinitionMetadata = {
  name: "reserve_table",
  version: "1.0.0",
  description: "Reserves a table at a restaurant for a specified party size and time.",
  parameters: tableReservationToolParameters,
  return_schema: tableReservationReturnSchema,
  timeout_ms: 30000,
  requires_confirmation: true,
  category: "action",
  rate_limits: {
    requests_per_minute: 10,
    requests_per_hour: 100
  }
};
