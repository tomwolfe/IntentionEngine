import { z } from "zod";

// Tool Parameter Schemas
export const GeocodeLocationSchema = z.object({
  location: z.string().min(1).max(500).trim(),
});

export const WeatherForecastSchema = z.object({
  location: z.string().min(1).max(500).trim(),
  date: z.string().min(1).max(100).trim(),
});

export const SearchRestaurantSchema = z.object({
  cuisine: z.string().max(100).trim().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  location: z.string().max(500).trim().optional(),
  romantic: z.boolean().optional(),
}).refine(data => (data.lat !== undefined && data.lon !== undefined) || data.location, {
  message: "Either coordinates (lat, lon) or location must be provided",
});

export const AddCalendarEventSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  start_time: z.string().min(1).trim(),
  end_time: z.string().min(1).trim(),
  location: z.string().max(500).trim().optional(),
  restaurant_name: z.string().max(200).trim().optional(),
  restaurant_address: z.string().max(500).trim().optional(),
  description: z.string().max(1000).trim().optional(),
});

// API Request Schemas
export const IntentRequestSchema = z.object({
  intent: z.string().min(1).max(2000).trim(),
  user_location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).nullable().optional(),
  dna_cuisine: z.string().optional(),
});

export const ExecuteRequestSchema = z.object({
  audit_log_id: z.string().min(1),
  step_index: z.number().min(0),
  user_confirmed: z.boolean().optional().default(false),
  parameters: z.any().optional(),
});

export const AuditRequestSchema = z.object({
  intent: z.string().min(1).max(2000).trim(),
  final_outcome: z.any().optional(), // Can be string or object
});

export const DownloadIcsSchema = z.object({
  title: z.string().default('Event'),
  start: z.string().min(1),
  end: z.string().optional().nullable(),
  location: z.string().optional().default(''),
  description: z.string().optional().default(''),
});