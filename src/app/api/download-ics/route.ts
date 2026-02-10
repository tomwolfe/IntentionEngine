import { NextRequest, NextResponse } from 'next/server';
import { addHours, isValid } from 'date-fns';
import { withReliability } from '@/lib/reliability';
import { DownloadIcsSchema } from '@/lib/validation-schemas';
import { formatICalDate, parseDateTime } from '@/lib/date-utils';

export async function GET(req: NextRequest) {
  return withReliability(req, async () => {
    const { searchParams } = new URL(req.url);
    const params = Object.fromEntries(searchParams.entries());
    
    // Check if this is a multi-event request
    const multipleEvents = searchParams.get('multiple_events') === 'true';
    const eventsParam = searchParams.get('events');
    
    if (multipleEvents && eventsParam) {
      try {
        const events = JSON.parse(decodeURIComponent(eventsParam));
        
        const vevents = events.map((event: any) => {
          const startDate = parseDateTime(event.start);
          let endDate = event.end ? parseDateTime(event.end) : addHours(startDate, 2);
          
          if (!isValid(endDate) || endDate <= startDate) {
            endDate = addHours(startDate, 2);
          }

          const formatLocation = (loc: string) => {
            const coordRegex = /^-?\d+\.\d+,-?\d+\.\d+$/;
            if (coordRegex.test(loc)) {
              return `https://www.google.com/maps/search/?api=1&query=${loc}`;
            }
            return loc || '';
          };
          
          return [
            'BEGIN:VEVENT',
            `SUMMARY:${event.title}`,
            `DTSTART:${formatICalDate(startDate)}`,
            `DTEND:${formatICalDate(endDate)}`,
            `LOCATION:${formatLocation(event.location)}`,
            `DESCRIPTION:${(event.description || '').replace(/\n/g, '\\n')}`,
            'END:VEVENT',
          ].join('\r\n');
        });
        
        const icsContent = [
          'BEGIN:VCALENDAR',
          'VERSION:2.0',
          'PRODID:-//IntentionEngine//EN',
          ...vevents,
          'END:VCALENDAR'
        ].join('\r\n');
        
        return new NextResponse(icsContent, {
          headers: {
            'Content-Type': 'text/calendar',
            'Content-Disposition': `attachment; filename="fused_events.ics"`,
          },
        });
      } catch (error) {
        return NextResponse.json({ error: "Invalid events parameter" }, { status: 400 });
      }
    }
    
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

    const formatLocation = (loc: string) => {
      const coordRegex = /^-?\d+\.\d+,-?\d+\.\d+$/;
      if (coordRegex.test(loc)) {
        return `https://www.google.com/maps/search/?api=1&query=${loc}`;
      }
      return loc || '';
    };

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//IntentionEngine//EN',
      'BEGIN:VEVENT',
      `SUMMARY:${title}`,
      `DTSTART:${formatICalDate(startDate)}`,
      `DTEND:${formatICalDate(endDate)}`,
      `LOCATION:${formatLocation(location)}`,
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
