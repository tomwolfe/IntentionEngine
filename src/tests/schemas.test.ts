import { describe, it, expect } from 'vitest';
import { ChatRequestSchema } from '@/lib/schema';

describe('ChatRequestSchema', () => {
  it('should validate a correct chat request', () => {
    const validRequest = {
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello!' },
        { role: 'assistant', content: 'Hi there!' },
        { role: 'tool', content: 'Tool output' }
      ],
      userLocation: { lat: 40.7128, lng: -74.0060 }
    };
    
    const result = ChatRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it('should reject invalid roles', () => {
    const invalidRequest = {
      messages: [
        { role: 'invalid_role', content: 'Hello!' }
      ]
    };
    
    const result = ChatRequestSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
  });

  it('should allow missing content', () => {
    const validRequest = {
      messages: [
        { role: 'user', parts: [{ type: 'text', text: 'Hi' }] }
      ]
    };
    
    const result = ChatRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });

  it('should reject invalid coordinates', () => {
    const invalidRequest = {
      messages: [{ role: 'user', content: 'Hi' }],
      userLocation: { lat: 100, lng: -74.0060 } // lat > 90
    };
    
    const result = ChatRequestSchema.safeParse(invalidRequest);
    expect(result.success).toBe(false);
  });

  it('should allow null userLocation', () => {
    const validRequest = {
      messages: [{ role: 'user', content: 'Hi' }],
      userLocation: null
    };
    
    const result = ChatRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
  });
});
