import { NextRequest, NextResponse } from 'next/server';
import { generateIcsContent } from '@/lib/tools';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const title = searchParams.get('title') || 'Event';
  const location = searchParams.get('location') || '';
  const time = searchParams.get('time') || new Date().toISOString();

  console.log(`[AUDIT] ICS Download: ${title} at ${location}`);

  const icsContent = generateIcsContent({
    title,
    location,
    startTime: time,
    durationMinutes: 120,
  });

  return new NextResponse(icsContent, {
    headers: {
      'Content-Type': 'text/calendar',
      'Content-Disposition': `attachment; filename="${title.replace(/\s+/g, '_')}.ics"`,
    },
  });
}
