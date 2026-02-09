import { NextRequest, NextResponse } from 'next/server';
import { addHours } from 'date-fns';
import { withReliability } from '@/lib/reliability';
import { DownloadIcsSchema } from '@/lib/validation-schemas';
import { formatICalDate, validateISOTimestamp } from '@/lib/date-utils';

/**
 * ICS Download Endpoint - Temporal Determinism Contract
 * 
 * This endpoint ONLY accepts absolute ISO-8601 timestamps.
 * Natural language dates ("tomorrow", "tonight") are REJECTED at the schema level.
 * 
 * Timezone handling: All dates are treated as local time (no UTC conversion).
 * The Z suffix is stripped when formatting for iCal to maintain local time semantics.
 */
export async function GET(req: NextRequest) {
  return withReliability(req, async () => {
    const { searchParams } = new URL(req.url);
    const params = Object.fromEntries(searchParams.entries());
    
    const validatedParams = DownloadIcsSchema.safeParse(params);
    if (!validatedParams.success) {
      console.error(`[AUDIT] ICS download rejected - invalid parameters:`, validatedParams.error.format());
      return NextResponse.json(
        { error: "Invalid parameters", details: validatedParams.error.format() }, 
        { status: 400 }
      );
    }

    const { title, start: startISO, end: endISO, location, description } = validatedParams.data;

    // Validate ISO timestamps (defense in depth - schema should have already validated)
    const startDate = validateISOTimestamp(startISO);
    if (!startDate) {
      const error = `[AUDIT] Invalid start timestamp: ${startISO}`;
      console.error(error);
      return NextResponse.json({ error: "Invalid start timestamp" }, { status: 400 });
    }

    let endDate: Date;
    if (endISO) {
      const validatedEnd = validateISOTimestamp(endISO);
      if (!validatedEnd) {
        const error = `[AUDIT] Invalid end timestamp: ${endISO}`;
        console.error(error);
        return NextResponse.json({ error: "Invalid end timestamp" }, { status: 400 });
      }
      endDate = validatedEnd;
    } else {
      // Default to 1 hour duration if no end time provided
      endDate = addHours(startDate, 1);
    }

    // Final safety check: end must be after start
    if (endDate.getTime() <= startDate.getTime()) {
      const error = `[AUDIT] Invalid time range: end time must be after start time`;
      console.error(error);
      return NextResponse.json({ error: "Invalid time range" }, { status: 400 });
    }

    console.log(`[AUDIT] Generating ICS: ${title} from ${startISO} to ${endDate.toISOString()}`);

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//IntentionEngine//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `SUMMARY:${title}`,
      `DTSTART:${formatICalDate(startDate)}`,
      `DTEND:${formatICalDate(endDate)}`,
      `LOCATION:${location || ''}`,
      `DESCRIPTION:${(description || '').replace(/\n/g, '\\n')}`,
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    return new NextResponse(icsContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.ics"`,
      },
    });
  });
}
