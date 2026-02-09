import { describe, it, expect } from 'vitest';
import { classifyIntent } from '../src/lib/intent';

describe('Intent Classification', () => {
  it('should classify greetings as SIMPLE', async () => {
    expect((await classifyIntent('Hi')).type).toBe('SIMPLE');
    expect((await classifyIntent('Hello')).type).toBe('SIMPLE');
    expect((await classifyIntent('Hey')).type).toBe('SIMPLE');
  });

  it('should classify thanks as SIMPLE', async () => {
    expect((await classifyIntent('Thanks')).type).toBe('SIMPLE');
    expect((await classifyIntent('thank you')).type).toBe('SIMPLE');
    expect((await classifyIntent('much appreciated')).type).toBe('SIMPLE');
  });

  it('should classify search queries correctly', async () => {
    expect((await classifyIntent('find a restaurant')).type).toBe('TOOL_SEARCH');
    expect((await classifyIntent('where can I eat?')).type).toBe('TOOL_SEARCH');
    expect((await classifyIntent('nearby food')).type).toBe('TOOL_SEARCH');
  });

  it('should classify calendar queries correctly', async () => {
    expect((await classifyIntent('add to my calendar')).type).toBe('TOOL_CALENDAR');
    expect((await classifyIntent('schedule a meeting')).type).toBe('TOOL_CALENDAR');
    expect((await classifyIntent('book a table')).type).toBe('TOOL_CALENDAR');
  });

  it('should return SIMPLE for short ambiguous input', async () => {
    const result = await classifyIntent('abc');
    expect(result.type).toBe('SIMPLE');
    expect(result.confidence).toBe(0.8);
  });

  it('should return SIMPLE with low confidence for long unknown input', async () => {
    const result = await classifyIntent('This is a relatively long message that does not contain any specific keywords for tools or simple intents.');
    expect(result.type).toBe('SIMPLE');
    expect(result.confidence).toBe(0.5);
  });

  it('should return 1.0 confidence for exact simple strings', async () => {
    expect((await classifyIntent('hello')).confidence).toBe(1.0);
    expect((await classifyIntent('much appreciated')).confidence).toBe(1.0);
  });

  it('should return 0.9 confidence for simple keywords in sentences', async () => {
    expect((await classifyIntent('well hello there')).confidence).toBe(0.9);
  });

  it('should classify vague requests as COMPLEX_PLAN and special intent', async () => {
    const result = await classifyIntent('find somewhere nice');
    expect(result.type).toBe('COMPLEX_PLAN');
    expect(result.isSpecialIntent).toBe(true);
    
    expect((await classifyIntent('somewhere good')).type).toBe('COMPLEX_PLAN');
    expect((await classifyIntent('a good spot')).type).toBe('COMPLEX_PLAN');
  });

  it('should handle mixed case and whitespace', async () => {
    expect((await classifyIntent('  THANKS  ')).type).toBe('SIMPLE');
    expect((await classifyIntent('Hi!')).type).toBe('SIMPLE');
  });
});
