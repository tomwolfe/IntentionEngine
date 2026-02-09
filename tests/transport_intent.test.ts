import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { classifyIntent, getDeterministicPlan } from '../src/lib/intent';
import { parseNaturalLanguageToDate, isValidISOTimestamp } from '../src/lib/date-utils';

describe('Transport Intent Handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should classify "need to be at the airport by 6 AM tomorrow" correctly', async () => {
    const input = 'I need to be at the airport by 6 AM tomorrow';
    const classification = await classifyIntent(input);
    
    expect(classification.type).toBe('TOOL_CALENDAR');
    expect(classification.isSpecialIntent).toBe(true);
    expect(classification.metadata?.isTransport).toBe(true);
    expect(classification.metadata?.location).toBe('the airport');
  });

  it('should generate a plan with a 2-hour buffer for transport intents', () => {
    // Set reference date to Feb 9, 2026 at noon
    const referenceDate = new Date('2026-02-09T12:00:00Z');
    vi.setSystemTime(referenceDate);

    const input = 'I need to be at the airport by 6 AM tomorrow';
    const classification = { 
      type: 'TOOL_CALENDAR' as const, 
      confidence: 0.95,
      reason: 'Time-critical transportation request detected',
      isSpecialIntent: true,
      metadata: { isTransport: true, location: 'the airport', targetTime: '6 AM tomorrow' }
    };
    
    const plan = getDeterministicPlan(classification, input, null, undefined, referenceDate);

    expect(plan.intent_type).toBe('transport');
    expect(plan.ordered_steps?.length).toBe(1);
    
    const step = plan.ordered_steps?.[0];
    expect(step?.tool_name).toBe('add_calendar_event');
    expect(step?.requires_confirmation).toBe(false);

    // Verify timestamps are valid ISO-8601 (not natural language)
    expect(isValidISOTimestamp(step?.parameters.start_time)).toBe(true);
    expect(isValidISOTimestamp(step?.parameters.end_time)).toBe(true);

    const startTime = new Date(step?.parameters.start_time);
    const endTime = new Date(step?.parameters.end_time);
    
    // Difference should be exactly 2 hours
    const diffMs = endTime.getTime() - startTime.getTime();
    expect(diffMs).toBe(2 * 60 * 60 * 1000);

    // End time should be on Feb 10 (tomorrow)
    // Note: We don't check specific hours since chrono-node returns local time
    expect(endTime.getUTCDate()).toBe(10);
    expect(endTime.getUTCMonth()).toBe(1); // February
  });

  it('should handle "arrival at [location] by [time]" pattern', async () => {
    const input = 'arrival at Heathrow by 8pm tonight';
    const classification = await classifyIntent(input);
    
    expect(classification.metadata?.isTransport).toBe(true);
    expect(classification.metadata?.location).toBe('Heathrow');
  });

  it('should use request-scoped reference time for temporal determinism', () => {
    // Test on Feb 9
    const referenceDate1 = new Date('2026-02-09T12:00:00Z');
    vi.setSystemTime(referenceDate1);

    const input = 'I need to be at the airport by 6 AM tomorrow';
    const classification = { 
      type: 'TOOL_CALENDAR' as const, 
      confidence: 0.95,
      reason: 'Time-critical transportation request detected',
      isSpecialIntent: true,
      metadata: { isTransport: true, location: 'the airport', targetTime: '6 AM tomorrow' }
    };
    
    const plan1 = getDeterministicPlan(classification, input, null, undefined, referenceDate1);
    const endTime1 = new Date(plan1.ordered_steps?.[0]?.parameters.end_time);
    
    // Should be Feb 10
    expect(endTime1.getUTCDate()).toBe(10);

    // Now test with a different reference date (Feb 15)
    const referenceDate2 = new Date('2026-02-15T12:00:00Z');
    vi.setSystemTime(referenceDate2);
    
    const plan2 = getDeterministicPlan(classification, input, null, undefined, referenceDate2);
    const endTime2 = new Date(plan2.ordered_steps?.[0]?.parameters.end_time);
    
    // Should be Feb 16 (not Feb 10!)
    expect(endTime2.getUTCDate()).toBe(16);
  });
});
