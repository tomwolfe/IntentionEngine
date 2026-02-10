import { describe, it, expect, vi, beforeEach } from 'vitest';
import { geocode_location, search_restaurant, add_calendar_event } from '../tools';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/setup';

// Mock Redis
vi.mock('@upstash/redis', () => {
  class Redis {
    get = vi.fn();
    setex = vi.fn();
    incr = vi.fn();
    expire = vi.fn();
  }
  return { Redis };
});

describe('Tools', () => {
  describe('geocode_location', () => {
    it('should return coordinates for a valid location', async () => {
      server.use(
        http.get('https://nominatim.openstreetmap.org/search', () => {
          return HttpResponse.json([{ lat: '40.7128', lon: '-74.0060' }]);
        })
      );

      const result = await geocode_location({ location: 'New York' });
      expect(result.success).toBe(true);
      expect(result.result).toEqual({ lat: 40.7128, lon: -74.0060 });
    });

    it('should return error for invalid location', async () => {
      server.use(
        http.get('https://nominatim.openstreetmap.org/search', () => {
          return HttpResponse.json([]);
        })
      );

      const result = await geocode_location({ location: 'InvalidPlace' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Location not found');
    });
  });

  describe('search_restaurant', () => {
    it('should return restaurants for valid coordinates', async () => {
      server.use(
        http.get('https://overpass-api.de/api/interpreter', () => {
          return HttpResponse.json({
            elements: [
              {
                tags: { name: 'Test Restaurant', 'addr:street': 'Test St' },
                lat: 40.7128,
                lon: -74.0060,
              },
            ],
          });
        })
      );

      const result = await search_restaurant({ lat: 40.7128, lon: -74.0060 });
      expect(result.success).toBe(true);
      expect(result.result).toHaveLength(1);
      expect(result.result[0].name).toBe('Test Restaurant');
    });
  });

  describe('add_calendar_event', () => {
    it('should return a ready status and download url', async () => {
      const params = {
        title: 'Dinner',
        start_time: '2026-02-10T19:00:00',
        end_time: '2026-02-10T21:00:00',
        restaurant_name: 'Test Restaurant',
      };
      const result = await add_calendar_event(params);
      expect(result.success).toBe(true);
      expect(result.result.status).toBe('ready');
      expect(result.result.download_url).toContain('title=Dinner');
    });
  });
});
