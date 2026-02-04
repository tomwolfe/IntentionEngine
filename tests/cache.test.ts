import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to ensure these are available during vi.mock hoisting
const { mockGet, mockSetex } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockSetex: vi.fn(),
}));

vi.mock('@upstash/redis', () => ({
  Redis: class {
    get = mockGet;
    setex = mockSetex;
  },
}));

// Mock env
vi.mock('../src/lib/config', () => ({
  env: {
    UPSTASH_REDIS_REST_URL: 'http://mock-redis',
    UPSTASH_REDIS_REST_TOKEN: 'mock-token',
  },
}));

// Import tools after mocks
import { search_restaurant } from '../src/lib/tools';

describe('search_restaurant cache logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('should use cached results if available', async () => {
    const cachedResult = [{ name: 'Cached Pizza', address: '123 Street' }];
    mockGet.mockResolvedValue(cachedResult);

    const result = await search_restaurant({ cuisine: 'pizza', lat: 40.712, lon: -74.006 });

    expect(mockGet).toHaveBeenCalledWith('restaurant:pizza:40.712:-74.006');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.result).toEqual(cachedResult);
  });

  it('should fetch from Overpass and cache results on miss', async () => {
    mockGet.mockResolvedValue(null);
    
    const mockOverpassResponse = {
      elements: [
        { 
          tags: { name: 'New Pizza', 'addr:street': '456 Ave' },
          lat: 40.712,
          lon: -74.006
        }
      ]
    };

    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => mockOverpassResponse,
    });

    const result = await search_restaurant({ cuisine: 'pizza', lat: 40.712, lon: -74.006 });

    expect(mockGet).toHaveBeenCalledWith('restaurant:pizza:40.712:-74.006');
    expect(global.fetch).toHaveBeenCalled();
    expect(mockSetex).toHaveBeenCalledWith('restaurant:pizza:40.712:-74.006', 3600, expect.any(Array));
    expect(result.success).toBe(true);
    expect(result.result?.[0].name).toBe('New Pizza');
  });

  it('should generate correct cache keys for different parameters', async () => {
    mockGet.mockResolvedValue([]);
    
    await search_restaurant({ cuisine: 'sushi', lat: 35.689, lon: 139.692 });
    expect(mockGet).toHaveBeenCalledWith('restaurant:sushi:35.689:139.692');

    await search_restaurant({ lat: 34.052, lon: -118.243 });
    expect(mockGet).toHaveBeenCalledWith('restaurant:any:34.052:-118.243');
  });
});