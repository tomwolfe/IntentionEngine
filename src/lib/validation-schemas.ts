import { z } from "zod";

// Input sanitization to prevent XSS
const sanitizeString = (val: string): string => {
  return val
    .trim()
    .replace(/[<>]/g, '') // Basic XSS prevention - remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers like onclick=
};

// Tool Parameter Schemas
export const GeocodeLocationSchema = z.object({
  location: z.string().min(1).max(500).transform(sanitizeString),
});

export const WeatherForecastSchema = z.object({
  location: z.string().min(1).max(500).transform(sanitizeString),
  date: z.string().min(1).max(100).transform(sanitizeString),
});

export const SearchRestaurantSchema = z.object({
  cuisine: z.string().max(100).optional().transform(val => val ? sanitizeString(val) : val),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  location: z.string().max(500).optional().transform(val => val ? sanitizeString(val) : val),
  romantic: z.boolean().optional(),
}).refine(data => (data.lat !== undefined && data.lon !== undefined) || data.location, {
  message: "Either coordinates (lat, lon) or location must be provided",
});

export const AddCalendarEventSchema = z.object({
  title: z.string().min(1).max(200).transform(sanitizeString),
  start_time: z.string().min(1).transform(sanitizeString),
  end_time: z.string().min(1).transform(sanitizeString),
  location: z.string().max(500).optional().transform(val => val ? sanitizeString(val) : val),
  restaurant_name: z.string().max(200).optional().transform(val => val ? sanitizeString(val) : val),
  restaurant_address: z.string().max(500).optional().transform(val => val ? sanitizeString(val) : val),
  description: z.string().max(1000).optional().transform(val => val ? sanitizeString(val) : val),
  wine_shop: z.object({
    name: z.string().optional().transform(val => val ? sanitizeString(val) : val),
    address: z.string().optional().transform(val => val ? sanitizeString(val) : val),
  }).optional(),
});

// API Request Schemas
export const IntentRequestSchema = z.object({
  intent: z.string().min(1).max(2000).transform(sanitizeString),
  user_location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).nullable().optional(),
  dna_cuisine: z.string().optional().transform(val => val ? sanitizeString(val) : val),
  session_context: z.object({
    cuisine: z.string().optional().transform(val => val ? sanitizeString(val) : val),
    ambiance: z.string().optional().transform(val => val ? sanitizeString(val) : val),
    occasion: z.string().optional().transform(val => val ? sanitizeString(val) : val),
  }).optional(),
  sessionId: z.string().uuid().optional(),
});

export const ExecuteRequestSchema = z.object({
  audit_log_id: z.string().min(1),
  step_index: z.number().min(0),
  user_confirmed: z.boolean().optional().default(false),
  parameters: z.any().optional(),
  sessionId: z.string().uuid().optional(),
});

export const AuditRequestSchema = z.object({
  intent: z.string().min(1).max(2000).transform(sanitizeString),
  final_outcome: z.any().optional(), // Can be string or object
});

export const DownloadIcsSchema = z.object({
  title: z.string().default('Event'),
  start: z.string().min(1),
  end: z.string().optional().nullable(),
  location: z.string().optional().default(''),
  description: z.string().optional().default(''),
});

export const FindEventSchema = z.object({
  location: z.string().max(500).optional().transform(val => val ? sanitizeString(val) : val),
  lat: z.number().min(-90).max(90).optional(),
  lon: z.number().min(-180).max(180).optional(),
  date: z.string().max(100).optional().transform(val => val ? sanitizeString(val) : val),
  query: z.string().max(200).optional().transform(val => val ? sanitizeString(val) : val),
}).refine(data => (data.lat !== undefined && data.lon !== undefined) || data.location, {
  message: "Either coordinates (lat, lon) or location must be provided",
});

export const DirectionsSchema = z.object({
  origin: z.string().min(1).max(500).transform(sanitizeString),
  destination: z.string().min(1).max(500).optional().transform(val => val ? sanitizeString(val) : val),
});