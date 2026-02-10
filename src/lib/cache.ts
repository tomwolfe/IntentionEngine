type CacheEntry<T> = {
  value: T;
  expiry: number;
};

class MemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private maxItems: number;

  constructor(maxItems: number = 100) {
    this.maxItems = maxItems;
  }

  set(key: string, value: any, ttlSeconds: number = 3600) {
    if (this.cache.size >= this.maxItems) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttlSeconds * 1000,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    return entry.value as T;
  }

  clear() {
    this.cache.clear();
  }
}

export const lruCache = new MemoryCache(200);
