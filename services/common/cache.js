const defaultTtlMs = 5 * 60 * 1000;

export function createMemoryCache({ ttlMs = defaultTtlMs } = {}) {
  const store = new Map();

  return {
    get(key) {
      const record = store.get(key);
      if (!record) return undefined;
      if (record.expiresAt < Date.now()) {
        store.delete(key);
        return undefined;
      }
      return record.value;
    },
    set(key, value) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    },
    clear() {
      store.clear();
    }
  };
}

export async function getOrSet(cache, key, loader) {
  const cached = cache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const value = await loader();
  cache.set(key, value);
  return value;
}
