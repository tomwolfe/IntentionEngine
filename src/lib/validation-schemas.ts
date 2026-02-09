import { z } from "zod";
import { isValidISOTimestamp, isValidTimeRange } from "./date-utils";

// ISO-8601 timestamp validator
const isoTimestampSchema = z.string().refine(
  (val) => isValidISOTimestamp(val),
  {
    message: "Must be a valid ISO-8601 timestamp (e.g., 2026-02-09T18:30:00.000Z)",
  }
);

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

/**
 * Calendar Event Schema with strict ISO-8601 timestamp validation
 * Natural language dates must be normalized BEFORE reaching this schema
 */
export const AddCalendarEventSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  start_time: isoTimestampSchema,
  end_time: isoTimestampSchema,
  location: z.string().max(500).trim().optional(),
  restaurant_name: z.string().max(200).trim().optional(),
  restaurant_address: z.string().max(500).trim().optional(),
  description: z.string().max(1000).trim().optional(),
}).refine(
  (data) => isValidTimeRange(data.start_time, data.end_time),
  {
    message: "End time must be after start time",
    path: ["end_time"],
  }
);

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
});

export const AuditRequestSchema = z.object({
  intent: z.string().min(1).max(2000).trim(),
  final_outcome: z.any().optional(), // Can be string or object
});

/**
 * Download ICS Schema - only accepts absolute ISO timestamps
 * Natural language dates like "tomorrow" are rejected at the API boundary
 */
export const DownloadIcsSchema = z.object({
  title: z.string().default('Event'),
  start: isoTimestampSchema,
  end: isoTimestampSchema.optional().nullable(),
  location: z.string().optional().default(''),
  description: z.string().optional().default(''),
}).refine(
  (data) => {
    if (!data.end) return true; // End is optional, defaults to start + 1 hour
    return isValidTimeRange(data.start, data.end);
  },
  {
    message: "End time must be after start time",
    path: ["end"],
  }
);