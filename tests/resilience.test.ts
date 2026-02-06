import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env before other imports
vi.mock('../src/lib/config', () => ({
  env: {
    LLM_API_KEY: 'test-key',
    LLM_BASE_URL: 'https://api.test.ai',
    LLM_MODEL: 'primary-model',
    SECONDARY_LLM_MODEL: 'secondary-model',
  }
}));

import { generatePlan } from '../src/lib/llm';
import { env } from '../src/lib/config';

// Mock global fetch
global.fetch = vi.fn();

describe('Resilience and Failover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should failover to secondary LLM when primary fails', async () => {
    const primaryModel = env.LLM_MODEL;
    const secondaryModel = env.SECONDARY_LLM_MODEL;

    // First call fails, second succeeds
    (fetch as any)
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable'
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: JSON.stringify({
                intent_type: 'dining',
                constraints: [],
                ordered_steps: [],
                summary: 'Fallback success'
              })
            }
          }]
        })
      });

    const plan = await generatePlan('I am hungry');

    expect(plan.summary).toBe('Fallback success');
    expect(fetch).toHaveBeenCalledTimes(2);

    // Verify first call used primary model
    const firstCallBody = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(firstCallBody.model).toBe(primaryModel);

    // Verify second call used secondary model
    const secondCallBody = JSON.parse((fetch as any).mock.calls[1][1].body);
    expect(secondCallBody.model).toBe(secondaryModel);
  });

  it('should throw error if both primary and secondary fail', async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable'
    });

    await expect(generatePlan('I am hungry')).rejects.toThrow('LLM call failed with status 503');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
