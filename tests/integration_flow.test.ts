import { describe, it, expect, vi } from 'vitest';
import { classifyIntent } from '../src/lib/intent-schema';
import { AuditOutcomeSchema } from '../src/lib/audit';

describe('Intention Engine Integration Flow', () => {
  describe('Intent Classification', () => {
    it('should classify simple intents as SIMPLE', () => {
      const result = classifyIntent('Hello');
      expect(result.type).toBe('SIMPLE');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should classify search intents as TOOL_SEARCH', () => {
      const result = classifyIntent('Find a good Italian restaurant nearby');
      expect(result.type).toBe('TOOL_SEARCH');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should classify calendar intents as TOOL_CALENDAR', () => {
      const result = classifyIntent('Add a meeting to my calendar');
      expect(result.type).toBe('TOOL_CALENDAR');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should classify multi-intent as COMPLEX_PLAN', () => {
      const result = classifyIntent('plan a dinner tomorrow');
      expect(result.type).toBe('COMPLEX_PLAN');
      expect(result.confidence).toBeGreaterThan(0.9);
    });
  });

  describe('Audit Log Schema', () => {
    it('should validate a correct AuditOutcome', () => {
      const validOutcome = {
        status: 'SUCCESS',
        message: 'I found 3 restaurants for you.',
        latency_ms: 1200,
        tokens_used: 150
      };
      
      const result = AuditOutcomeSchema.safeParse(validOutcome);
      expect(result.success).toBe(true);
    });

    it('should reject an invalid AuditOutcome', () => {
      const invalidOutcome = {
        status: 'INVALID_STATUS',
        message: 123 // Should be string
      };
      
      const result = AuditOutcomeSchema.safeParse(invalidOutcome);
      expect(result.success).toBe(false);
    });

    it('should verify that a SIMPLE intent outcome matches the schema', () => {
      // Simulating what happens in page.tsx for a SIMPLE intent
      const classification = classifyIntent('Hello');
      expect(classification.type).toBe('SIMPLE');
      
      const simulatedOutcome = {
        status: 'SUCCESS',
        message: 'Hi! How can I help you today?'
      };
      
      const result = AuditOutcomeSchema.safeParse(simulatedOutcome);
      expect(result.success).toBe(true);
    });
  });
});
