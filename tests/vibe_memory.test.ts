import { describe, it, expect, vi, beforeEach } from 'vitest';
import { search_restaurant, VIBE_MEMORY_KEY } from '../src/lib/tools';
import { cache } from '../src/lib/cache';

vi.mock('../src/lib/cache', () => ({
  cache: {
    get: vi.fn(),
    set: vi.fn(),
  },
  CACHE_TTLS: {
    RESTAURANTS: 86400,
  }
}));

global.fetch = vi.fn();

describe('Vibe Memory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update Vibe Memory on successful search', async () => {
    (cache.get as any).mockResolvedValue(null); // No cache hit for restaurants
    (cache.get as any).mockImplementation((key: string) => {
        if (key === VIBE_MEMORY_KEY) return Promise.resolve([]);
        return Promise.resolve(null);
    });

    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        elements: [
          {
            tags: { name: 'Test Italian', cuisine: 'Italian' },
            lat: 40,
            lon: -70
          }
        ]
      })
    });

    await search_restaurant({ cuisine: 'Italian', lat: 40, lon: -70 });

    expect(cache.set).toHaveBeenCalledWith(VIBE_MEMORY_KEY, ['Italian'], 86400 * 30);
  });

  it('should bias search when romantic is true and cuisine is generic', async () => {
    (cache.get as any).mockImplementation((key: string) => {
      if (key === VIBE_MEMORY_KEY) return Promise.resolve(['French', 'Italian']);
      return Promise.resolve(null);
    });

    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ elements: [] })
    });

    await search_restaurant({ cuisine: 'dinner', lat: 40, lon: -70, romantic: true });

    // The fetch should have been called with 'French' in the query
    const fetchCall = (fetch as any).mock.calls[0][0];
    expect(decodeURIComponent(fetchCall)).toContain('cuisine"~"French"');
  });

  it('should cap memory at 3 items and remove duplicates', async () => {
    (cache.get as any).mockImplementation((key: string) => {
      if (key === VIBE_MEMORY_KEY) return Promise.resolve(['Italian', 'French', 'Japanese']);
      return Promise.resolve(null);
    });

    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        elements: [
          {
            tags: { name: 'New French', cuisine: 'French' },
            lat: 40,
            lon: -70
          }
        ]
      })
    });

    await search_restaurant({ cuisine: 'French', lat: 40, lon: -70 });

    // French should move to front, Italian and Japanese stay, capped at 3
    expect(cache.set).toHaveBeenCalledWith(VIBE_MEMORY_KEY, ['French', 'Italian', 'Japanese'], 86400 * 30);
  });

  it('should not add "any" to memory', async () => {
    (cache.get as any).mockImplementation((key: string) => {
        if (key === VIBE_MEMORY_KEY) return Promise.resolve(['Italian']);
        return Promise.resolve(null);
    });

    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        elements: [
          {
            tags: { name: 'Generic Place' }, // No cuisine tag
            lat: 40,
            lon: -70
          }
        ]
      })
    });

    await search_restaurant({ cuisine: 'any', lat: 40, lon: -70 });

    // Memory should NOT have been updated with 'any'
    expect(cache.set).not.toHaveBeenCalledWith(VIBE_MEMORY_KEY, expect.arrayContaining(['any']), expect.any(Number));
  });

  it('should handle undefined cuisine safely', async () => {
    (cache.get as any).mockResolvedValue(null);
    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ elements: [] })
    });

    // Should not throw
    await expect(search_restaurant({ lat: 40, lon: -70, romantic: true })).resolves.toBeDefined();
  });
});
