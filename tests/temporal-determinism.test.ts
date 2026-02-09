import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  parseNaturalLanguageDate, 
  parseNaturalLanguageToDate,
  isValidISOTimestamp, 
  validateISOTimestamp,
  isValidTimeRange,
  formatISOForICal,
  addHoursToISO,
  createNormalizedCalendarEvent
} from '../src/lib/date-utils';
import { GET as downloadIcsGET } from '@/app/api/download-ics/route';
import { add_calendar_event } from '@/lib/tools';
import { NextRequest } from 'next/server';

describe('Temporal Determinism', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('ISO Timestamp Validation', () => {
    it('should accept valid ISO-8601 timestamps', () => {
      expect(isValidISOTimestamp('2026-02-09T18:30:00.000Z')).toBe(true);
      expect(isValidISOTimestamp('2026-02-09T18:30:00Z')).toBe(true);
      expect(isValidISOTimestamp('2026-02-09T18:30:00')).toBe(true);
      expect(isValidISOTimestamp('2026-02-09T18:30:00.123Z')).toBe(true);
      expect(isValidISOTimestamp('2026-02-09T18:30:00+00:00')).toBe(true);
      expect(isValidISOTimestamp('2026-02-09T18:30:00-05:00')).toBe(true);
    });

    it('should reject natural language dates', () => {
      expect(isValidISOTimestamp('tomorrow')).toBe(false);
      expect(isValidISOTimestamp('tonight')).toBe(false);
      expect(isValidISOTimestamp('next Monday')).toBe(false);
      expect(isValidISOTimestamp('6pm tomorrow')).toBe(false);
    });

    it('should reject invalid timestamps', () => {
      expect(isValidISOTimestamp('')).toBe(false);
      expect(isValidISOTimestamp('invalid')).toBe(false);
      expect(isValidISOTimestamp('2026-13-01T00:00:00Z')).toBe(false); // Invalid month
      expect(isValidISOTimestamp('not-a-date')).toBe(false);
    });
  });

  describe('Natural Language Date Parsing', () => {
    it('should parse "tomorrow" relative to reference date', () => {
      // Set "today" to Feb 9, 2026
      const referenceDate = new Date('2026-02-09T12:00:00Z');
      vi.setSystemTime(referenceDate);

      const result = parseNaturalLanguageDate('tomorrow', referenceDate);
      expect(result).not.toBeNull();
      
      const parsed = new Date(result!);
      // Should be Feb 10 (tomorrow)
      expect(parsed.getUTCDate()).toBe(10);
      expect(parsed.getUTCMonth()).toBe(1); // February (0-indexed)
      expect(parsed.getUTCFullYear()).toBe(2026);
    });

    it('should parse "tonight" and return valid ISO', () => {
      const referenceDate = new Date('2026-02-09T14:00:00Z');
      vi.setSystemTime(referenceDate);

      const result = parseNaturalLanguageDate('tonight', referenceDate);
      expect(result).not.toBeNull();
      
      // Most important: result should be a valid ISO timestamp
      expect(isValidISOTimestamp(result!)).toBe(true);
    });

    it('should handle year rollover (Dec 31 -> Jan 1)', () => {
      const referenceDate = new Date('2026-12-31T12:00:00Z');
      vi.setSystemTime(referenceDate);

      const result = parseNaturalLanguageDate('tomorrow', referenceDate);
      expect(result).not.toBeNull();
      
      const parsed = new Date(result!);
      expect(parsed.getUTCDate()).toBe(1); // Jan 1
      expect(parsed.getUTCMonth()).toBe(0); // January
      expect(parsed.getUTCFullYear()).toBe(2027); // Next year
    });

    it('should use request-scoped reference time, not system time', () => {
      // Set system time to one date
      vi.setSystemTime(new Date('2026-02-09T00:00:00Z'));
      
      // But use a different reference date
      const referenceDate = new Date('2026-02-15T12:00:00Z');
      
      const result = parseNaturalLanguageDate('tomorrow', referenceDate);
      const parsed = new Date(result!);
      
      // Should be Feb 16, not Feb 10
      expect(parsed.getUTCDate()).toBe(16);
    });

    it('should return valid ISO string from natural language', () => {
      const referenceDate = new Date('2026-02-09T12:00:00Z');
      const result = parseNaturalLanguageDate('tomorrow at 3pm', referenceDate);
      
      expect(result).not.toBeNull();
      expect(isValidISOTimestamp(result!)).toBe(true);
    });
  });

  describe('Time Range Validation', () => {
    it('should validate correct time ranges', () => {
      expect(isValidTimeRange(
        '2026-02-09T18:00:00Z',
        '2026-02-09T20:00:00Z'
      )).toBe(true);
    });

    it('should reject equal start and end times', () => {
      expect(isValidTimeRange(
        '2026-02-09T18:00:00Z',
        '2026-02-09T18:00:00Z'
      )).toBe(false);
    });

    it('should reject end before start', () => {
      expect(isValidTimeRange(
        '2026-02-09T20:00:00Z',
        '2026-02-09T18:00:00Z'
      )).toBe(false);
    });

    it('should reject invalid ISO strings', () => {
      expect(isValidTimeRange('invalid', '2026-02-09T20:00:00Z')).toBe(false);
      expect(isValidTimeRange('2026-02-09T18:00:00Z', 'invalid')).toBe(false);
    });
  });

  describe('ISO Timestamp Arithmetic', () => {
    it('should add hours to ISO timestamp', () => {
      const result = addHoursToISO('2026-02-09T18:00:00Z', 2);
      expect(result).toBe('2026-02-09T20:00:00.000Z');
    });

    it('should handle invalid timestamps', () => {
      expect(addHoursToISO('invalid', 2)).toBeNull();
    });
  });

  describe('Calendar Event Normalization', () => {
    it('should create normalized event with valid timestamps', () => {
      const event = createNormalizedCalendarEvent(
        'Dinner',
        '2026-02-09T18:00:00Z',
        '2026-02-09T20:00:00Z',
        'Restaurant Address',
        'A nice dinner'
      );

      expect(event).not.toBeNull();
      expect(event?.title).toBe('Dinner');
      expect(event?.start).toBe('2026-02-09T18:00:00Z');
      expect(event?.end).toBe('2026-02-09T20:00:00Z');
    });

    it('should reject events with invalid timestamps', () => {
      const event = createNormalizedCalendarEvent(
        'Dinner',
        'tomorrow at 6pm', // Invalid - natural language
        '2026-02-09T20:00:00Z',
        'Restaurant'
      );

      expect(event).toBeNull();
    });

    it('should reject events with end before start', () => {
      const event = createNormalizedCalendarEvent(
        'Dinner',
        '2026-02-09T20:00:00Z',
        '2026-02-09T18:00:00Z' // End before start
      );

      expect(event).toBeNull();
    });
  });

  describe('ICS Download Endpoint', () => {
    it('should accept valid ISO timestamps', async () => {
      const req = new NextRequest(
        'http://localhost/api/download-ics?title=Dinner&start=2026-02-09T19:00:00Z&end=2026-02-09T21:00:00Z'
      );
      
      const res = await downloadIcsGET(req);
      expect(res.status).toBe(200);
      
      const text = await res.text();
      expect(text).toContain('BEGIN:VCALENDAR');
      expect(text).toContain('SUMMARY:Dinner');
      expect(text).toContain('DTSTART:20260209T');
    });

    it('should reject natural language dates', async () => {
      const req = new NextRequest(
        'http://localhost/api/download-ics?title=Dinner&start=tomorrow&end=next+week'
      );
      
      const res = await downloadIcsGET(req);
      expect(res.status).toBe(400);
      
      const data = await res.json();
      expect(data.error).toBe('Invalid parameters');
    });

    it('should reject "tomorrow" in URL', async () => {
      const req = new NextRequest(
        'http://localhost/api/download-ics?title=Dinner&start=tomorrow+at+6pm'
      );
      
      const res = await downloadIcsGET(req);
      expect(res.status).toBe(400);
    });

    it('should handle default end time (1 hour after start)', async () => {
      const req = new NextRequest(
        'http://localhost/api/download-ics?title=Dinner&start=2026-02-09T19:00:00Z'
      );
      
      const res = await downloadIcsGET(req);
      expect(res.status).toBe(200);
      
      const text = await res.text();
      // Should have end time 1 hour later (20:00)
      expect(text).toContain('DTEND:20260209T');
    });
  });

  describe('Edge Runtime Behavior', () => {
    it('should handle multiple requests with different reference times', () => {
      // First request on Feb 9
      vi.setSystemTime(new Date('2026-02-09T12:00:00Z'));
      const ref1 = new Date();
      const result1 = parseNaturalLanguageDate('tomorrow', ref1);
      expect(new Date(result1!).getUTCDate()).toBe(10);

      // Second request on Feb 15 (simulating a later request)
      vi.setSystemTime(new Date('2026-02-15T12:00:00Z'));
      const ref2 = new Date();
      const result2 = parseNaturalLanguageDate('tomorrow', ref2);
      expect(new Date(result2!).getUTCDate()).toBe(16);
    });

    it('should never use module-scoped reference date', () => {
      // Simulate module load time vs request time
      const moduleLoadTime = new Date('2026-01-01T00:00:00Z');
      const requestTime = new Date('2026-06-15T12:00:00Z');

      vi.setSystemTime(requestTime);
      
      // Parse with explicit reference date (request-scoped)
      const result = parseNaturalLanguageDate('tomorrow', requestTime);
      const parsed = new Date(result!);

      // Should be June 16, not Jan 2
      expect(parsed.getUTCMonth()).toBe(5); // June
      expect(parsed.getUTCDate()).toBe(16);
    });
  });

  describe('Transport Intent: Airport by 6 AM tomorrow', () => {
    it('should resolve "6 AM tomorrow" to the correct calendar date', () => {
      // Today is Feb 9, 2026
      const referenceDate = new Date('2026-02-09T12:00:00Z');
      vi.setSystemTime(referenceDate);

      // Parse "6 AM tomorrow"
      const result = parseNaturalLanguageDate('6 AM tomorrow', referenceDate);
      expect(result).not.toBeNull();

      const parsed = new Date(result!);
      // Should be Feb 10 (tomorrow)
      expect(parsed.getUTCDate()).toBe(10);
      // Result should be a valid ISO timestamp
      expect(isValidISOTimestamp(result!)).toBe(true);
    });

    it('should create valid calendar event for transport intent', async () => {
      const event = createNormalizedCalendarEvent(
        'Travel to Airport',
        '2026-02-10T04:00:00Z', // Start 2 hours before
        '2026-02-10T06:00:00Z'  // End at target time
      );

      expect(event).not.toBeNull();
      expect(event?.title).toBe('Travel to Airport');
      expect(isValidTimeRange(event!.start, event!.end)).toBe(true);
    });
  });
});

describe('Calendar Event Tool - Hardened Validation', () => {
  it('should accept valid ISO timestamps', async () => {
    const result = await add_calendar_event({
      title: 'Dinner',
      start_time: '2026-02-09T18:00:00Z',
      end_time: '2026-02-09T20:00:00Z',
      location: 'Restaurant'
    });

    expect(result.success).toBe(true);
    expect(result.result.download_url).toContain('/api/download-ics');
  });

  it('should reject natural language dates by throwing validation error', async () => {
    // The tool should throw when validation fails
    await expect(add_calendar_event({
      title: 'Dinner',
      start_time: 'tomorrow at 6pm',
      end_time: 'tomorrow at 8pm',
      location: 'Restaurant'
    })).rejects.toThrow('Invalid parameters');
  });

  it('should reject end time before start time by throwing validation error', async () => {
    await expect(add_calendar_event({
      title: 'Dinner',
      start_time: '2026-02-09T20:00:00Z',
      end_time: '2026-02-09T18:00:00Z',
      location: 'Restaurant'
    })).rejects.toThrow('Invalid parameters');
  });

  it('should reject invalid ISO format by throwing validation error', async () => {
    await expect(add_calendar_event({
      title: 'Dinner',
      start_time: '2026-13-45T99:00:00Z', // Invalid date
      end_time: '2026-02-09T20:00:00Z',
      location: 'Restaurant'
    })).rejects.toThrow('Invalid parameters');
  });
});
