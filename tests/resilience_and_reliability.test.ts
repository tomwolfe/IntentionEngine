import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as intentPOST } from '@/app/api/intent/route';
import { geocode_location, search_restaurant } from '@/lib/tools';
import { toolBreakers } from '@/lib/utils/reliability';
import { NextRequest } from 'next/server';

// Mock fetch for all tests

global.fetch = vi.fn().mockImplementation((url: string) => {

  if (url.includes('nominatim') || url.includes('overpass')) {

    return Promise.resolve({

      ok: true,

      json: () => Promise.resolve({

        elements: [],

        display_name: "Mock Location"

      })

    });

  }

  if (url.includes('open-meteo')) {

    return Promise.resolve({

      ok: true,

      json: () => Promise.resolve({

        daily: { weathercode: [0], temperature_2m_max: [20], temperature_2m_min: [15], precipitation_probability_max: [0] }

      })

    });

  }

  return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });

});





vi.mock('@/lib/config', () => ({

  env: {

    LLM_API_KEY: 'test-key',

    LLM_BASE_URL: 'https://api.openai.com/v1',

    LLM_MODEL: 'gpt-4o',

    SECONDARY_LLM_MODEL: 'gpt-3.5-turbo'

  }

}));



vi.mock('@/lib/tools', async () => {
  const actual = await vi.importActual('@/lib/tools') as any;
  return {
    ...actual,
    get_weather_forecast: vi.fn().mockResolvedValue({ success: true, result: { condition: 'Clear', temperature_high: 20, date: '2026-02-10' } }),
  };
});

describe('Scenario 5: Resilience & Reliability', () => {

  beforeEach(() => {

    vi.clearAllMocks();

    // Clear breakers

    Object.keys(toolBreakers).forEach(key => delete toolBreakers[key]);

  });



  describe('Cloud LLM Fallback', () => {

    it('should fallback to secondary model and then to local plan if cloud fails', async () => {

      // Mock first fetch (primary LLM) to fail

      // Mock second fetch (secondary LLM) to succeed

      (fetch as any)

        .mockRejectedValueOnce(new Error("Primary Failed"))

        .mockResolvedValueOnce({

          ok: true,

          json: () => Promise.resolve({

            choices: [{ message: { content: "Poetic fallback summary." } }]

          })

        });



      const input = "Find a restaurant";

      const req = new NextRequest('http://localhost/api/intent', {

        method: 'POST',

        body: JSON.stringify({ intent: input })

      });

      

      const res = await intentPOST(req);

      const data = await res.json();

      

      expect(data.plan.summary).toBe("Poetic fallback summary.");

    });



    it('should use a hardcoded fallback plan if all LLMs fail', async () => {

       // Mock all LLM calls to fail

       (fetch as any).mockRejectedValue(new Error("Complete LLM Failure"));



       const input = "Find a restaurant";

       const req = new NextRequest('http://localhost/api/intent', {

         method: 'POST',

         body: JSON.stringify({ intent: input })

       });

       

       const res = await intentPOST(req);

       const data = await res.json();

       

       expect(data.is_fallback).toBe(true);

       expect(data.plan.intent_type).toBe("dining_fallback");

       expect(data.plan.summary).toContain("I'm having trouble reaching my brain");

    });

  });



  describe('Geocoding Failure & Circuit Breaker', () => {

    it('should open circuit breaker after 3 failures', async () => {

      vi.useFakeTimers();

      // Mock nominatim to fail

      (fetch as any).mockRejectedValue(new Error("Nominatim Down"));



      // 1st failure

      const p1 = geocode_location({ location: "Paris" });

      await vi.runAllTimersAsync();

      const res1 = await p1;

      expect(res1.success).toBe(false);

      expect(toolBreakers['nominatim'].getFailures()).toBe(1);



      // 2nd failure

      const p2 = geocode_location({ location: "London" });

      await vi.runAllTimersAsync();

      const res2 = await p2;

      expect(res2.success).toBe(false);

      expect(toolBreakers['nominatim'].getFailures()).toBe(2);



      // 3rd failure

      const p3 = geocode_location({ location: "Berlin" });

      await vi.runAllTimersAsync();

      const res3 = await p3;

      expect(res3.success).toBe(false);

      expect(toolBreakers['nominatim'].getState()).toBe('OPEN');



      // 4th call - should fail immediately due to circuit breaker

      const res4 = await geocode_location({ location: "Tokyo" });

      expect(res4.success).toBe(false);

      expect(res4.error).toContain("Circuit breaker for nominatim is OPEN");

      

      vi.useRealTimers();

    });



    it('should handle geocoding failure gracefully in search_restaurant', async () => {

       vi.useFakeTimers();

       // Mock nominatim to fail

       (fetch as any).mockRejectedValue(new Error("Nominatim Down"));



       const p = search_restaurant({ location: "Paris", cuisine: "Italian" });

       await vi.runAllTimersAsync();

       const res = await p;

       expect(res.success).toBe(false);

       expect(res.error).toBe("Could not geocode location and no coordinates provided.");

       vi.useRealTimers();

    });

  });

});
