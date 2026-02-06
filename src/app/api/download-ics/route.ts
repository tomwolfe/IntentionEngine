import { NextRequest, NextResponse } from 'next/server';
import { addHours, isValid, format, parseISO, addDays, set } from 'date-fns';
import { withReliability } from '@/lib/reliability';
import { DownloadIcsSchema } from '@/lib/validation-schemas';

function formatICalDate(date: Date): string {
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

export async function GET(req: NextRequest) {
  return withReliability(req, async () => {
    const { searchParams } = new URL(req.url);
    const params = Object.fromEntries(searchParams.entries());
    
    const validatedParams = DownloadIcsSchema.safeParse(params);
    if (!validatedParams.success) {
      return NextResponse.json({ error: "Invalid parameters", details: validatedParams.error.format() }, { status: 400 });
    }

    const { title, start: startStr, end: endStr, location, description } = validatedParams.data;

    const startDate = parseDateTime(startStr);
    let endDate = endStr ? parseDateTime(endStr) : addHours(startDate, 1);

    if (!isValid(endDate) || endDate <= startDate) {
      endDate = addHours(startDate, 1);
    }

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//IntentionEngine//EN',
      'BEGIN:VEVENT',
      `SUMMARY:${title}`,
      `DTSTART:${formatICalDate(startDate)}`,
      `DTEND:${formatICalDate(endDate)}`,
      `LOCATION:${location}`,
      `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    return new NextResponse(icsContent, {
      headers: {
        'Content-Type': 'text/calendar',
        'Content-Disposition': `attachment; filename="${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.ics"`,
      },
    });
  });
}
