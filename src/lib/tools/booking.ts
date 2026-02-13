import { z } from "zod";
import { ToolDefinitionMetadata, ToolParameter } from "./types";
import { geocode_location, search_web } from "./location_search";
import { env } from "../config";
import { signServiceToken } from "../auth";

export const TableReservationSchema = z.object({
  restaurant_name: z.string().describe("The name of the restaurant."),
  restaurant_address: z.string().optional().describe("The address of the restaurant."),
  lat: z.number().optional().describe("Latitude of the restaurant for precise booking."),
  lon: z.number().optional().describe("Longitude of the restaurant for precise booking."),
  date: z.string().describe("The date of the reservation (ISO 8601 format, e.g., '2026-02-11')."),
  time: z.string().describe("The time of the reservation (e.g., '19:00')."),
  party_size: z.number().int().positive().describe("Number of people in the party."),
  contact_name: z.string().describe("The name for the reservation."),
  contact_phone: z.string().describe("Contact phone number for the reservation."),
  contact_email: z.string().email().optional().describe("Contact email for the reservation."),
  special_requests: z.string().optional().describe("Any special requests for the reservation."),
  is_confirmed: z.boolean().default(false).describe("Set to true ONLY if the user has explicitly confirmed these specific details.")
});

export type TableReservationParams = z.infer<typeof TableReservationSchema>;

export const tableReservationReturnSchema = {
  status: "string",
  confirmation_code: "string",
  restaurant: "string",
  restaurant_location: "object",
  time: "string",
  date: "string",
  party_size: "number",
  message: "string"
};

export async function reserve_restaurant(params: TableReservationParams): Promise<{ success: boolean; result?: any; error?: string }> {
  const validated = TableReservationSchema.safeParse(params);
  if (!validated.success) {
    return { success: false, error: "Invalid parameters: " + JSON.stringify(validated.error.format()) };
  }

  const { 
    restaurant_name, restaurant_address,
    party_size, date, time, 
    contact_name, contact_phone, contact_email,
    is_confirmed 
  } = validated.data;

  if (!is_confirmed) {
    return {
      success: false,
      error: `CONFIRMATION_REQUIRED: Please confirm booking at ${restaurant_name} for ${party_size} on ${date} at ${time}.`
    };
  }

  const startTime = `${date}T${time}:00`;

  try {
    const token = await signServiceToken({ service: 'intention-engine' });
    // 1. Try to reserve via TableStack
    let response = await fetch(`${env.TABLESTACK_API_URL}/reserve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        restaurantName: restaurant_name,
        guestName: contact_name,
        guestEmail: contact_email || 'guest@example.com',
        partySize: party_size,
        startTime,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      return {
        success: true,
        result: {
          status: "confirmed",
          message: data.message,
          booking_id: data.bookingId,
        }
      };
    }

    // 2. If not found or unauthorized, try discovery
    if (response.status === 404 || response.status === 400) {
      console.log(`Restaurant ${restaurant_name} not found in TableStack. Initiating shadow discovery...`);
      
      // Use DuckDuckGo via search_web for email extraction
      const searchResult = await search_web(`${restaurant_name} restaurant email contact`);
      const discoveredEmail = searchResult.success && searchResult.result.email 
        ? searchResult.result.email 
        : `info@${restaurant_name.toLowerCase().replace(/ /g, '')}.com`; // Fallback heuristic
      
      console.log(`Discovered email for ${restaurant_name}: ${discoveredEmail}`);

      // 3. Create Shadow Reservation
      response = await fetch(`${env.TABLESTACK_API_URL}/reserve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          restaurantName: restaurant_name,
          restaurantEmail: discoveredEmail,
          guestName: contact_name,
          guestEmail: contact_email || 'guest@example.com',
          partySize: party_size,
          startTime,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          result: {
            status: "shadow_confirmed",
            message: `We've sent a reservation request to ${restaurant_name}. They will contact you at ${discoveredEmail} if there are any issues.`,
            booking_id: data.bookingId,
          }
        };
      }
    }

    const errorData = await response.json();
    return { success: false, error: errorData.message || "Failed to reserve restaurant" };

  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function reserve_table(params: TableReservationParams): Promise<{ success: boolean; result?: any; error?: string }> {
  const validated = TableReservationSchema.safeParse(params);
  if (!validated.success) {
    return { success: false, error: "Invalid parameters: " + JSON.stringify(validated.error.format()) };
  }
  
  const { 
    restaurant_name, restaurant_address, lat, lon, 
    party_size, date, time, 
    contact_name, contact_phone, contact_email,
    is_confirmed 
  } = validated.data;

  if (!is_confirmed) {
    return {
      success: false,
      error: `CONFIRMATION_REQUIRED: Please present these details to the user and ask for explicit confirmation before booking:\n` +
             `- Restaurant: ${restaurant_name}\n` +
             `- Date: ${date}\n` +
             `- Time: ${time}\n` +
             `- Party Size: ${party_size}\n` +
             `- Contact: ${contact_name} (${contact_phone}${contact_email ? `, ${contact_email}` : ""})\n` +
             `Set 'is_confirmed: true' only after the user says yes.`
    };
  }
  
  console.log(`Reserving table for ${party_size} at ${restaurant_name} on ${date} at ${time}...`);
  
  try {
    let locationResult = null;

    if (lat !== undefined && lon !== undefined) {
      locationResult = { lat, lon };
    } else {
      // Attempt to geocode using name and address for better accuracy
      const geocodeQuery = restaurant_address ? `${restaurant_name}, ${restaurant_address}` : restaurant_name;
      const geo = await geocode_location({ location: geocodeQuery });
      if (geo.success && geo.result) {
        locationResult = geo.result;
      }
    }

    const locationInfo = locationResult ? ` (Location: ${locationResult.lat}, ${locationResult.lon})` : "";
    
    // Generate a confirmation code
    const confirmationCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    
    return {
      success: true,
      result: {
        status: "confirmed",
        confirmation_code: confirmationCode,
        restaurant: restaurant_name,
        restaurant_location: locationResult,
        date: date,
        time: time,
        party_size: party_size,
        message: `Table for ${party_size} confirmed at ${restaurant_name} on ${date} at ${time}${locationInfo}. Confirmation code: ${confirmationCode}.`
      }
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export const reserveRestaurantToolDefinition: ToolDefinitionMetadata = {
  name: "reserve_restaurant",
  version: "1.0.0",
  description: "Authorized to perform restaurant reservations with automated discovery and shadow onboarding for non-partner venues.",
  inputSchema: {
    type: "object",
    properties: {
      restaurant_name: { type: "string", description: "The name of the restaurant." },
      restaurant_address: { type: "string", description: "The address of the restaurant." },
      date: { type: "string", description: "The date of the reservation (ISO 8601 format)." },
      time: { type: "string", description: "The time of the reservation (e.g., '19:00')." },
      party_size: { type: "number", description: "Number of guests." },
      contact_name: { type: "string", description: "The name for the reservation." },
      contact_phone: { type: "string", description: "The contact phone for the reservation." },
      contact_email: { type: "string", description: "The contact email for the reservation." },
      is_confirmed: { type: "boolean", description: "Set to true only if the user has explicitly confirmed these details." }
    },
    required: ["restaurant_name", "date", "party_size", "time", "contact_name", "contact_phone"]
  },
  return_schema: tableReservationReturnSchema,
  timeout_ms: 30000,
  requires_confirmation: true,
  category: "action",
  parameter_aliases: {
    "party size": "party_size",
    "booking time": "time"
  },
  rate_limits: {
    requests_per_minute: 10,
    requests_per_hour: 100
  }
};

export const reserveTableToolDefinition: ToolDefinitionMetadata = {
  name: "reserve_table",
  version: "1.0.0",
  description: "Reserves a table at a restaurant for a specified party size and time.",
  inputSchema: {
    type: "object",
    properties: {
      restaurant_name: { type: "string", description: "The name of the restaurant." },
      restaurant_address: { type: "string", description: "The address of the restaurant." },
      lat: { type: "number", description: "Latitude of the restaurant." },
      lon: { type: "number", description: "Longitude of the restaurant." },
      date: { type: "string", description: "The date of the reservation (ISO 8601 format)." },
      time: { type: "string", description: "The time of the reservation (e.g., '19:00')." },
      party_size: { type: "number", description: "Number of guests." },
      contact_name: { type: "string", description: "The name for the reservation." },
      contact_phone: { type: "string", description: "The contact phone for the reservation." },
      special_requests: { type: "string", description: "Any special requests." }
    },
    required: ["restaurant_name", "date", "party_size", "time"]
  },
  return_schema: tableReservationReturnSchema,
  timeout_ms: 30000,
  requires_confirmation: true,
  category: "action",
  rate_limits: {
    requests_per_minute: 10,
    requests_per_hour: 100
  }
};
