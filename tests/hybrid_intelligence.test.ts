import { describe, it, expect, vi, beforeEach } from 'vitest';
import { classifyIntent } from '@/lib/intent';
import { POST as intentPOST } from '@/app/api/intent/route';

// Mock fetch for all tests
global.fetch = vi.fn();

vi.mock('@/lib/config', () => ({
  env: {
    LLM_API_KEY: 'test-key',
    LLM_BASE_URL: 'https://api.openai.com/v1',
    LLM_MODEL: 'gpt-4o'
  }
}));

describe('Scenario 4: Hybrid Intelligence (Local First, Cloud Power)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Scenario: "Hello!" or "What time is it?"', () => {
    it('should classify "Hello!" as SIMPLE with high confidence', async () => {
      const classification = await classifyIntent("Hello!");
      expect(classification.type).toBe("SIMPLE");
      expect(classification.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should classify "What time is it?" as SIMPLE with high confidence', async () => {
      const classification = await classifyIntent("What time is it?");
      expect(classification.type).toBe("SIMPLE");
      // Since it's a short input with no tool markers, it defaults to SIMPLE
      expect(classification.type).toBe("SIMPLE");
      expect(classification.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  describe('Scenario: "I\'m looking for a good Italian restaurant in Paris, and I\'d like to add it to my calendar."', () => {
    it('should classify as COMPLEX_PLAN and use cloud LLM', async () => {
      const input = "I'm looking for a good Italian restaurant in Paris, and I'd like to add it to my calendar.";
      const classification = await classifyIntent(input);
      
      expect(classification.type).toBe("COMPLEX_PLAN");
      expect(classification.isSpecialIntent).toBe(true);

      // Mock cloud LLM response
      (fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [{ message: { content: "A taste of Italy in the heart of Paris." } }]
        })
      });

      const req = new NextRequest('http://localhost/api/intent', {
        method: 'POST',
        body: JSON.stringify({ intent: input })
      });
      
      const res = await intentPOST(req);
      const data = await res.json();
      
      expect(data.plan.ordered_steps.length).toBeGreaterThan(1);
      expect(data.plan.ordered_steps.some((s: any) => s.tool_name === "search_restaurant")).toBe(true);
      expect(data.plan.ordered_steps.some((s: any) => s.tool_name === "add_calendar_event")).toBe(true);
      expect(data.plan.summary).toBe("A taste of Italy in the heart of Paris.");
    });
  });
});

import { NextRequest } from 'next/server';
