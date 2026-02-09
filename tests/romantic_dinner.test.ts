import { describe, it, expect } from 'vitest';
import { getDeterministicPlan, classifyIntent } from '../src/lib/intent';

describe('Romantic Dinner Timing with Longitude Adjustment', () => {
  it('should set dinner to 7 PM LOCAL time in London (Lon 0)', async () => {
    const referenceDate = new Date('2026-02-09T16:00:00Z'); // 4 PM UTC
    const input = "Plan a romantic dinner for tomorrow night.";
    const classification = await classifyIntent(input);
    const userLocation = { lat: 51.5074, lng: -0.1278 }; // London
    const plan = getDeterministicPlan(classification, input, userLocation, "any", referenceDate);
    
    // London is roughly UTC. Tomorrow is Feb 10.
    // 7 PM Local should be 7 PM UTC.
    const expectedTime = "2026-02-10T19:00:00.000Z";
    
    const calendarStep = plan.ordered_steps?.find(s => s.tool_name === 'add_calendar_event');
    expect(calendarStep?.parameters.start_time).toBe(expectedTime);
  });

  it('should set dinner to 7 PM LOCAL time in Rhinelander (Lon -89)', async () => {
    const referenceDate = new Date('2026-02-09T16:00:00Z'); // 10 AM CST (4 PM UTC)
    const input = "Plan a romantic dinner for tomorrow night.";
    const classification = await classifyIntent(input);
    const userLocation = { lat: 45.6366, lng: -89.4121 }; // Rhinelander
    const plan = getDeterministicPlan(classification, input, userLocation, "any", referenceDate);
    
    // Rhinelander is -6 hours. 
    // Tomorrow is Feb 10.
    // 7 PM Local Rhinelander (CST) is 01:00 UTC on Feb 11.
    const expectedTime = "2026-02-11T01:00:00.000Z";
    
    const calendarStep = plan.ordered_steps?.find(s => s.tool_name === 'add_calendar_event');
    expect(calendarStep?.parameters.start_time).toBe(expectedTime);
  });

  it('should trust chrono for "night" if no explicit override, but in local context', async () => {
    // Input without "romantic" or "dinner" to avoid the 7 PM override
    // Using "evening" which chrono usually parses as 7 PM or 8 PM
    const referenceDate = new Date('2026-02-09T16:00:00Z');
    const input = "Plan something for tomorrow evening";
    const classification = await classifyIntent(input);
    const userLocation = { lat: 45.6366, lng: -89.4121 }; // Rhinelander (-6h)
    const plan = getDeterministicPlan(classification, input, userLocation, "any", referenceDate);
    
    const calendarStep = plan.ordered_steps?.find(s => s.tool_name === 'add_calendar_event');
    const startTime = calendarStep?.parameters.start_time;
    
    // Chrono "evening" is usually 20:00 (8 PM).
    // 8 PM Local Rhinelander is 02:00 UTC on Feb 11.
    expect(startTime).toBe("2026-02-11T02:00:00.000Z");
  });
});