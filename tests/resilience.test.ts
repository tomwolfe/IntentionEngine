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

    // 1. Geocode call (nominatim)
    // 2. Weather call (open-meteo)
    // 3. Primary LLM call (fails)
    // 4. Secondary LLM call (succeeds)
    (fetch as any)
      .mockResolvedValueOnce({ // Geocode
        ok: true,
        json: () => Promise.resolve([{ lat: '51.5', lon: '-0.1' }])
      })
      .mockResolvedValueOnce({ // Weather
        ok: true,
        json: () => Promise.resolve({ daily: { weathercode: [0], temperature_2m_max: [20], temperature_2m_min: [10], precipitation_probability_max: [0] } })
      })
      .mockResolvedValueOnce({ // Primary LLM
        ok: false,
        status: 503,
        statusText: 'Service Unavailable'
      })
      .mockResolvedValueOnce({ // Secondary LLM
        ok: true,
        json: () => Promise.resolve({
          choices: [{
            message: {
              content: 'Fallback success'
            }
          }]
        })
      });

    const plan = await generatePlan('I am hungry');

    expect(plan.summary).toBe('Fallback success');
    expect(fetch).toHaveBeenCalledTimes(4);

    // LLM calls are 3rd and 4th
    const firstLLMCallBody = JSON.parse((fetch as any).mock.calls[2][1].body);
    expect(firstLLMCallBody.model).toBe(primaryModel);

    const secondLLMCallBody = JSON.parse((fetch as any).mock.calls[3][1].body);
    expect(secondLLMCallBody.model).toBe(secondaryModel);
  });

  it('should fallback to minimal summary if both primary and secondary fail', async () => {
    (fetch as any)
      .mockResolvedValueOnce({ // Geocode
        ok: true,
        json: () => Promise.resolve([{ lat: '51.5', lon: '-0.1' }])
      })
      .mockResolvedValueOnce({ // Weather
        ok: true,
        json: () => Promise.resolve({ daily: { weathercode: [0], temperature_2m_max: [20], temperature_2m_min: [10], precipitation_probability_max: [0] } })
      })
      .mockResolvedValue({ // LLMs
        ok: false,
        status: 503,
        statusText: 'Service Unavailable'
      });

    const plan = await generatePlan('I am hungry');
    expect(plan.summary).toBe('Your arrangements are ready.');
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
