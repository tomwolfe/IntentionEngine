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
    const result = classifyIntent('abc');
    expect(result.type).toBe('SIMPLE');
    expect(result.confidence).toBe(0.8);
  });

  it('should return SIMPLE with low confidence for long unknown input', () => {
    const result = classifyIntent('This is a relatively long message that does not contain any specific keywords for tools or simple intents.');
    expect(result.type).toBe('SIMPLE');
    expect(result.confidence).toBe(0.5);
  });

  it('should return 1.0 confidence for exact simple strings', () => {
    expect(classifyIntent('hello').confidence).toBe(1.0);
    expect(classifyIntent('much appreciated').confidence).toBe(1.0);
  });

  it('should return 0.9 confidence for simple keywords in sentences', () => {
    expect(classifyIntent('well hello there').confidence).toBe(0.9);
  });

  it('should handle mixed case and whitespace', () => {
    expect(classifyIntent('  THANKS  ').type).toBe('SIMPLE');
    expect(classifyIntent('Hi!').type).toBe('SIMPLE');
  });
});
