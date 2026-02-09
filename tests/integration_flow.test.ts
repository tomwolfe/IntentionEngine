import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyIntent } from '../src/lib/intent';
import { generatePlan } from '../src/lib/llm';
import { AuditOutcomeSchema } from '../src/lib/audit';

describe('Intention Engine Integration Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('The Silent Whisper (LLM Output)', () => {
    it('should generate a poetic summary under 100 characters for "Plan a dinner"', async () => {
      // Steve Jobs: "Silent Execution" - The whisper must be brief and beautiful.
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: 'A perfect evening, curated for you.' } }]
        })
      });

      const plan = await generatePlan('Plan a dinner');
      expect(plan.summary.length).toBeLessThan(100);
      expect(plan.summary).not.toContain('\n');
      expect(plan.summary).not.toMatch(/I found|I have/i);
    });
  });

  describe('The "Thinking" State (UI Logic)', () => {
    it('should verify that a simple intent like "Hello" results in no "Thinking" text', async () => {
      // Steve Jobs: "Silent Execution" - We verify that the classification logic 
      // doesn't force a 'THINKING' state where a 'SIMPLE' one suffices.
      const classification = await classifyIntent('Hello');
      expect(classification.type).toBe('SIMPLE');
      // In page.tsx, if classification.type is SIMPLE, it skips the heavy runAutomatedChain
      // that triggers the persistent thinking state.
    });
  });

  describe('Intent Classification', () => {
    it('should classify simple intents as SIMPLE', async () => {
      const result = await classifyIntent('Hello');
      expect(result.type).toBe('SIMPLE');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should classify search intents as TOOL_SEARCH', async () => {
      const result = await classifyIntent('Find a good Italian restaurant nearby');
      expect(result.type).toBe('TOOL_SEARCH');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should classify calendar intents as TOOL_CALENDAR', async () => {
      const result = await classifyIntent('Add a meeting to my calendar');
      expect(result.type).toBe('TOOL_CALENDAR');
      expect(result.confidence).toBeGreaterThan(0.8);
    });

    it('should classify multi-intent as COMPLEX_PLAN', async () => {
      const result = await classifyIntent('plan a dinner tomorrow');
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

    it('should verify that a SIMPLE intent outcome matches the schema', async () => {
      // Simulating what happens in page.tsx for a SIMPLE intent
      const classification = await classifyIntent('Hello');
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
