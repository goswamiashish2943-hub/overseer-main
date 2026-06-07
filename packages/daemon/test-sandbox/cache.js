// test-sandbox/cache.js
// Simulates an in-memory LRU-style cache

const store = new Map();
const MAX_SIZE = 100;

function set(key, value, ttlMs = 60000) {
  if (store.size >= MAX_SIZE) {
    // BUG: evicts random key, not LRU — could evict fresh entries
    const randomKey = [...store.keys()][Math.floor(Math.random() * store.size)];
    store.delete(randomKey);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function invalidate(key) {
  store.delete(key);
}

function clear() {
  store.clear();
}

function stats() {
  return { size: store.size, maxSize: MAX_SIZE };
}

async function getOrSet(key, fetchFn, ttlMs = 60000) {
  const cached = get(key);
  if (cached !== null) return cached;
  const fresh = await fetchFn();
  set(key, fresh, ttlMs);
  return fresh;
}

module.exports = { set, get, invalidate, clear, stats };
