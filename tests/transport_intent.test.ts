import { describe, it, expect } from 'vitest';
import { classifyIntent, getDeterministicPlan } from '../src/lib/intent';

describe('Transport Intent Handling', () => {
  it('should classify "need to be at the airport by 6 AM tomorrow" correctly', async () => {
    const input = 'I need to be at the airport by 6 AM tomorrow';
    const classification = await classifyIntent(input);
    
    expect(classification.type).toBe('TOOL_CALENDAR');
    expect(classification.isSpecialIntent).toBe(true);
    expect(classification.metadata?.isTransport).toBe(true);
    expect(classification.metadata?.location).toBe('the airport');
  });

  it('should generate a plan with a 2-hour buffer for transport intents', async () => {
    const input = 'I need to be at the airport by 6 AM tomorrow';
    const classification = await classifyIntent(input);
    const plan = getDeterministicPlan(classification, input);

    expect(plan.intent_type).toBe('transport');
    expect(plan.ordered_steps?.length).toBe(1);
    
    const step = plan.ordered_steps?.[0];
    expect(step?.tool_name).toBe('add_calendar_event');
    expect(step?.requires_confirmation).toBe(false);

    const startTime = new Date(step?.parameters.start_time);
    const endTime = new Date(step?.parameters.end_time);
    
    // Difference should be exactly 2 hours
    const diffMs = endTime.getTime() - startTime.getTime();
    expect(diffMs).toBe(2 * 60 * 60 * 1000);

    // End time should match the parsed target time
    const expectedEndTime = require('chrono-node').parseDate(input);
    expect(endTime.getTime()).toBe(expectedEndTime.getTime());
  });

  it('should handle "arrival at [location] by [time]" pattern', async () => {
    const input = 'arrival at Heathrow by 8pm tonight';
    const classification = await classifyIntent(input);
    
    expect(classification.metadata?.isTransport).toBe(true);
    expect(classification.metadata?.location).toBe('Heathrow');
  });
});
