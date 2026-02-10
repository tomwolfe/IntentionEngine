import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { parseNaturalLanguageDate } from '@/lib/date-utils';

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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const params = Object.fromEntries(searchParams.entries());
  
  const validatedParams = DownloadIcsSchema.safeParse(params);
  if (!validatedParams.success) {
    return NextResponse.json({ error: "Invalid parameters", details: validatedParams.error.format() }, { status: 400 });
  }

  const { title, start: startStr, end: endStr, location, description } = validatedParams.data;

  const startDate = await parseNaturalLanguageDate(startStr);
  let endDate = endStr ? await parseNaturalLanguageDate(endStr) : new Date(startDate.getTime() + 60 * 60 * 1000);

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
