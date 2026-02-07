import { isValid, format } from 'date-fns';
import * as chrono from 'chrono-node';

export function formatICalDate(date: Date): string {
  // Removing 'Z' to use local time instead of UTC, as requested for Rhinelander time.
  return format(date, "yyyyMMdd'T'HHmmss");
}

export function parseDateTime(dt: string): Date {
  const parsed = chrono.parseDate(dt);
  if (parsed && isValid(parsed)) {
    return parsed;
  }

  const now = new Date();
  // Try standard Date constructor as fallback
  const fallback = new Date(dt);
  if (isValid(fallback)) return fallback;

  return now;
}
