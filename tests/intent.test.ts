import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../src/lib/intent';

describe('Intent Classification', () => {
  it('should classify greetings as SIMPLE', () => {
    expect(classifyIntent('Hi').type).toBe('SIMPLE');
    expect(classifyIntent('Hello').type).toBe('SIMPLE');
    expect(classifyIntent('Hey').type).toBe('SIMPLE');
  });

  it('should classify thanks as SIMPLE', () => {
    expect(classifyIntent('Thanks').type).toBe('SIMPLE');
    expect(classifyIntent('thank you').type).toBe('SIMPLE');
    expect(classifyIntent('much appreciated').type).toBe('SIMPLE');
  });

  it('should classify search queries correctly', () => {
    expect(classifyIntent('find a restaurant').type).toBe('TOOL_SEARCH');
    expect(classifyIntent('where can I eat?').type).toBe('TOOL_SEARCH');
    expect(classifyIntent('nearby food').type).toBe('TOOL_SEARCH');
  });

  it('should classify calendar queries correctly', () => {
    expect(classifyIntent('add to my calendar').type).toBe('TOOL_CALENDAR');
    expect(classifyIntent('schedule a meeting').type).toBe('TOOL_CALENDAR');
    expect(classifyIntent('book a table').type).toBe('TOOL_CALENDAR');
  });

  it('should return SIMPLE for short ambiguous input', () => {
    expect(classifyIntent('abc').type).toBe('SIMPLE');
  });

  it('should handle mixed case and whitespace', () => {
    expect(classifyIntent('  THANKS  ').type).toBe('SIMPLE');
    expect(classifyIntent('Hi!').type).toBe('SIMPLE');
  });
});
