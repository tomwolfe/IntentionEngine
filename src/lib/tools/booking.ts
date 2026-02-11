import { z } from "zod";

export const TableReservationSchema = z.object({
  restaurant_name: z.string().describe("The name of the restaurant."),
  party_size: z.number().int().positive().describe("Number of people in the party."),
  reservation_time: z.string().describe("The date and time of the reservation in ISO 8601 format."),
  contact_phone: z.string().optional().describe("Contact phone number for the reservation.")
});

export async function reserve_table(params: z.infer<typeof TableReservationSchema>) {
  console.log(`Reserving table for ${params.party_size} at ${params.restaurant_name} for ${params.reservation_time}...`);
  return {
    success: true,
    result: {
      status: "confirmed",
      confirmation_code: Math.random().toString(36).substring(2, 10).toUpperCase(),
      restaurant: params.restaurant_name,
      time: params.reservation_time,
      party_size: params.party_size
    }
  };
}
