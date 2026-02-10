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



    it('should use a minimal fallback summary if all LLMs fail', async () => {
       // Mock all LLM calls to fail
       (fetch as any).mockRejectedValue(new Error("Complete LLM Failure"));

       const input = "I want to find a nice place to eat and then schedule it";
       const req = new NextRequest('http://localhost/api/intent', {
         method: 'POST',
         body: JSON.stringify({ intent: input })
       });
       
       const res = await intentPOST(req);
       const data = await res.json();
       
       expect(data.plan.summary).toBe("Your arrangements are ready.");
    });
  });

  describe('Geocoding Failure & Circuit Breaker', () => {
    it('should use default coordinates after circuit breaker opens', async () => {
      vi.useFakeTimers();
      // Mock nominatim to fail
      (fetch as any).mockRejectedValue(new Error("Nominatim Down"));

      // 1st failure
      const p1 = geocode_location({ location: "Paris" });
      await vi.runAllTimersAsync();
      const res1 = await p1;
      expect(res1.success).toBe(false);

      // 2nd failure
      const p2 = geocode_location({ location: "London" });
      await vi.runAllTimersAsync();
      const res2 = await p2;
      expect(res2.success).toBe(false);

      // 3rd failure
      const p3 = geocode_location({ location: "Berlin" });
      await vi.runAllTimersAsync();
      const res3 = await p3;
      expect(res3.success).toBe(false);
      expect(toolBreakers['nominatim'].getState()).toBe('OPEN');

      // 4th call - should return default coordinates due to silent recovery
      const res4 = await geocode_location({ location: "Tokyo" });
      expect(res4.success).toBe(true);
      expect(res4.result).toEqual({ lat: 51.5074, lon: -0.1278 });
      
      vi.useRealTimers();
    });

    it('should handle geocoding failure by falling back to default coordinates in search_restaurant', async () => {
       // Mock fetch to fail for nominatim and succeed for overpass
       (fetch as any).mockImplementation((url: string) => {
         if (url.includes('nominatim')) {
           return Promise.reject(new Error("Nominatim Down"));
         }
         return Promise.resolve({
           ok: true,
           json: () => Promise.resolve({ 
             elements: [{ tags: { name: 'Test Resto' }, lat: 51.5, lon: -0.1 }] 
           })
         });
       });

       // Trigger enough failures to open the breaker
       // Each geocode_location call retries 3 times, so we need enough calls to hit the threshold (3)
       for(let i=0; i<3; i++) {
         await geocode_location({ location: "Paris" });
       }

       expect(toolBreakers['nominatim'].getState()).toBe('OPEN');

       const res = await search_restaurant({ location: "Paris", cuisine: "Italian" });
       expect(res.success).toBe(true);
       expect(res.result![0].name).toBe("Test Resto");
    }, 30000);

  });

});
