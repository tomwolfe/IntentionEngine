import { describe, it, expect } from 'vitest';
import { getDeterministicPlan, classifyIntent } from '../src/lib/intent';

describe('Romantic Dinner Timing', () => {
  it('should set romantic dinner to 7 PM (19:00) UTC even with "tomorrow night"', async () => {
    const referenceDate = new Date('2026-02-09T10:00:00Z'); // Monday 10 AM UTC
    const input = "Plan a romantic dinner for tomorrow night.";
    const classification = await classifyIntent(input);
    const plan = getDeterministicPlan(classification, input, null, "any", referenceDate);
    
    // Tomorrow is 2026-02-10
    // 7 PM UTC is 19:00:00.000Z
    const expectedTime = "2026-02-10T19:00:00.000Z";
    
    const calendarStep = plan.ordered_steps?.find(s => s.tool_name === 'add_calendar_event');
    expect(calendarStep?.parameters.start_time).toBe(expectedTime);
  });

  it('should set dinner to 7 PM UTC for generic "Plan dinner" requests', async () => {
    const referenceDate = new Date('2026-02-09T10:00:00Z'); // Monday 10 AM UTC
    const input = "Plan dinner for this friday"; // "Plan" makes it COMPLEX_PLAN
    const classification = await classifyIntent(input);
    const plan = getDeterministicPlan(classification, input, null, "any", referenceDate);
    
    // Friday is 2026-02-13
    const expectedTime = "2026-02-13T19:00:00.000Z";
    
    const calendarStep = plan.ordered_steps?.find(s => s.tool_name === 'add_calendar_event');
    expect(calendarStep?.parameters.start_time).toBe(expectedTime);
  });
});
