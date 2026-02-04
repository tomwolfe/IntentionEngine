import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const DownloadIcsSchema = z.object({
  title: z.string().default('Event'),
  start: z.string().min(1),
  end: z.string().optional().nullable(),
  location: z.string().optional().default(''),
  description: z.string().optional().default(''),
});

function formatICalDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function parseDateTime(dt: string): Date {
  const d = new Date(dt);
  if (!isNaN(d.getTime())) return d;
  
  // Basic "tomorrow" handling
  if (dt.toLowerCase().includes("tomorrow")) {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    
    // Try to extract time like "7pm" or "19:00"
    const timeMatch = dt.match(/(\d+)(?::(\d+))?\s*(am|pm)?/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1]);
      const minutes = parseInt(timeMatch[2] || "0");
      const ampm = (timeMatch[3] || "").toLowerCase();
      
      if (ampm === "pm" && hours < 12) hours += 12;
      if (ampm === "am" && hours === 12) hours = 0;
      
      tomorrow.setHours(hours, minutes, 0, 0);
      return tomorrow;
    }
    return tomorrow;
  }
  return d;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const params = Object.fromEntries(searchParams.entries());
  
  const validatedParams = DownloadIcsSchema.safeParse(params);
  if (!validatedParams.success) {
    return NextResponse.json({ error: "Invalid parameters", details: validatedParams.error.format() }, { status: 400 });
  }

  const { title, start: startStr, end: endStr, location, description } = validatedParams.data;

  const startDate = parseDateTime(startStr);
  let endDate = endStr ? parseDateTime(endStr) : new Date(startDate.getTime() + 60 * 60 * 1000);

  // If endDate is invalid or before startDate, make it 1 hour after startDate
  if (isNaN(endDate.getTime()) || endDate <= startDate) {
    endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
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
}
