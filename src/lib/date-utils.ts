import { isValid, format, parseISO } from 'date-fns';
import * as chrono from 'chrono-node';

/**
 * Temporal Determinism Contract
 * 
 * All date handling in IntentionEngine must follow these rules:
 * 1. Natural language dates are parsed ONCE at the request boundary using a request-scoped reference time
 * 2. Only ISO-8601 timestamps flow through the system after parsing
 * 3. The .ics generation endpoint receives only absolute timestamps, never natural language
 * 4. No module-scoped or cached reference dates allowed
 */

// ISO-8601 regex for strict validation
const ISO_8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Validates if a string is a valid ISO-8601 timestamp
 * This is the gatekeeper - only ISO strings pass this boundary
 */
export function isValidISOTimestamp(str: string): boolean {
  if (!str || typeof str !== 'string') return false;
  if (!ISO_8601_REGEX.test(str)) return false;
  const parsed = parseISO(str);
  return isValid(parsed);
}

/**
 * Validates ISO timestamp and returns the parsed Date or null
 * Use this to ensure type safety at boundaries
 */
export function validateISOTimestamp(str: string): Date | null {
  if (!isValidISOTimestamp(str)) return null;
  return parseISO(str);
}

/**
 * Parses natural language date expressions into absolute ISO timestamps
 * This is the ONLY place where chrono-node should be called with a reference date
 * 
 * @param input - Natural language date (e.g., "tomorrow at 6pm", "tonight")
 * @param referenceDate - The reference time (must be new Date() inside request handler)
 * @returns ISO-8601 timestamp string or null if parsing fails
 */
export function parseNaturalLanguageDate(
  input: string, 
  referenceDate: Date = new Date()
): string | null {
  if (!input || typeof input !== 'string') return null;
  
  const parsed = chrono.parseDate(input, referenceDate);
  
  if (!parsed || !isValid(parsed)) {
    return null;
  }
  
  return parsed.toISOString();
}

/**
 * Parses natural language date and returns Date object
 * Use this when you need the Date for calculations before converting to ISO
 */
export function parseNaturalLanguageToDate(
  input: string,
  referenceDate: Date = new Date()
): Date | null {
  if (!input || typeof input !== 'string') return null;
  
  const parsed = chrono.parseDate(input, referenceDate);
  
  if (!parsed || !isValid(parsed)) {
    return null;
  }
  
  return parsed;
}

/**
 * Formats a Date for iCal format (local time, no UTC conversion)
 * Example: 20260209T183000
 */
export function formatICalDate(date: Date): string {
  return format(date, "yyyyMMdd'T'HHmmss");
}

/**
 * Formats an ISO timestamp for iCal format
 * Validates the input is a proper ISO timestamp first
 */
export function formatISOForICal(isoTimestamp: string): string | null {
  const date = validateISOTimestamp(isoTimestamp);
  if (!date) return null;
  return formatICalDate(date);
}

/**
 * Adds hours to an ISO timestamp and returns a new ISO timestamp
 */
export function addHoursToISO(isoTimestamp: string, hours: number): string | null {
  const date = validateISOTimestamp(isoTimestamp);
  if (!date) return null;
  
  const result = new Date(date.getTime() + hours * 60 * 60 * 1000);
  return result.toISOString();
}

/**
 * Validates that end time is after start time
 * Both must be valid ISO timestamps
 */
export function isValidTimeRange(startISO: string, endISO: string): boolean {
  const start = validateISOTimestamp(startISO);
  const end = validateISOTimestamp(endISO);
  
  if (!start || !end) return false;
  return end.getTime() > start.getTime();
}

/**
 * @deprecated Use parseNaturalLanguageDate with explicit referenceDate instead
 * This function is kept for backward compatibility but should not be used in new code
 */
export function parseDateTime(dt: string): Date {
  // Try chrono with current time as reference
  const parsed = chrono.parseDate(dt, new Date());
  if (parsed && isValid(parsed)) {
    return parsed;
  }

  // Try ISO parsing
  const isoParsed = parseISO(dt);
  if (isValid(isoParsed)) return isoParsed;

  // Fallback to Date constructor
  const fallback = new Date(dt);
  if (isValid(fallback)) return fallback;

  // Last resort: return current time
  return new Date();
}

/**
 * Creates a normalized calendar event with validated ISO timestamps
 * Returns null if validation fails
 */
export function createNormalizedCalendarEvent(
  title: string,
  startTimeISO: string,
  endTimeISO: string,
  location?: string,
  description?: string
): { title: string; start: string; end: string; location: string; description: string } | null {
  // Validate both timestamps
  if (!isValidISOTimestamp(startTimeISO) || !isValidISOTimestamp(endTimeISO)) {
    return null;
  }
  
  // Validate time range
  if (!isValidTimeRange(startTimeISO, endTimeISO)) {
    return null;
  }
  
  return {
    title: title || 'Event',
    start: startTimeISO,
    end: endTimeISO,
    location: location || '',
    description: description || ''
  };
}
