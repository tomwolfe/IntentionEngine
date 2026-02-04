import { describe, it, expect } from 'vitest';
import { detectSimpleTask } from '../src/lib/routing';

describe('detectSimpleTask', () => {
  it('should return true for short greetings', () => {
    expect(detectSimpleTask('Hi')).toBe(true);
    expect(detectSimpleTask('Hello!')).toBe(true);
    expect(detectSimpleTask('How are you?')).toBe(true);
  });

  it('should return false for messages with tool keywords', () => {
    expect(detectSimpleTask('search for a restaurant')).toBe(false);
    expect(detectSimpleTask('add to my calendar')).toBe(false);
    expect(detectSimpleTask('plan a dinner')).toBe(false);
    expect(detectSimpleTask('geocode this address')).toBe(false);
  });

  it('should return false for very long messages even without keywords', () => {
    const longMessage = 'This is a very long message that exceeds one hundred characters just to make sure that the length check is working correctly as expected by the requirements of this task.'.repeat(1);
    expect(detectSimpleTask(longMessage)).toBe(false);
  });
});
