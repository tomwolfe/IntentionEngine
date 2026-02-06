import { addHours, isValid, format, parseISO, addDays, set } from 'date-fns';

export function formatICalDate(date: Date): string {
  return format(date, "yyyyMMdd'T'HHmmss'Z'");
}

export function parseDateTime(dt: string): Date {
  // Try ISO first
  let date = parseISO(dt);
  if (isValid(date)) return date;

  const now = new Date();
  const lowerDt = dt.toLowerCase().trim();

  // "tomorrow at 3pm" etc.
  if (lowerDt.includes("tomorrow")) {
    date = addDays(now, 1);
    const timeMatch = lowerDt.match(/(\d+)(?::(\d+))?\s*(am|pm)?/);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2] || "0");
      const ampm = timeMatch[3];
      
      if (ampm === "pm" && hours < 12) hours += 12;
      if (ampm === "am" && hours === 12) hours = 0;
      
      return set(date, { hours, minutes, seconds: 0, milliseconds: 0 });
    }
    return set(date, { hours: 12, minutes: 0, seconds: 0, milliseconds: 0 });
  }

  // "today at 7pm"
  if (lowerDt.includes("today") || lowerDt.includes("tonight")) {
    date = now;
    const timeMatch = lowerDt.match(/(\d+)(?::(\d+))?\s*(am|pm)?/);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2] || "0");
      const ampm = timeMatch[3];
      
      if (ampm === "pm" && hours < 12) hours += 12;
      if (ampm === "am" && hours === 12) hours = 0;
      
      return set(date, { hours, minutes, seconds: 0, milliseconds: 0 });
    }
    return set(date, { hours: 19, minutes: 0, seconds: 0, milliseconds: 0 });
  }

  // Try standard Date constructor as fallback
  const fallback = new Date(dt);
  if (isValid(fallback)) return fallback;

  return now;
}
