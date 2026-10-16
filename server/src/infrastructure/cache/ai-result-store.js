import { env } from '../../config/env.js';
import { logger } from '../logging/logger.js';
import { redis as defaultRedis } from '../redis/redis.js';

const releaseScript = `
if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end
return 0`;

/**
 * Key-value store for reusable AI results and in-flight locks. Uses Redis when it is enabled and
 * connected, and a bounded in-process map otherwise. Every Redis failure degrades to "no value"
 * so a cache outage never fails a request.
 */
export function createAiResultStore({
  redis = defaultRedis,
  redisReady = () => env.REDIS_ENABLED && redis.status === 'ready',
  now = () => Date.now(),
  maxEntries = 1_000,
  log = logger,
} = {}) {
  const memory = new Map();

  function live(key) {
    const entry = memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      memory.delete(key);
      return null;
    }
    return entry;
  }

  function memorySet(key, value, ttlMs) {
    memory.delete(key);
    memory.set(key, { value, expiresAt: now() + ttlMs });
    while (memory.size > maxEntries) memory.delete(memory.keys().next().value);
  }

  async function guarded(operation, fallback) {
    try {
      return await operation();
    } catch (error) {
      log.warn({ errorCode: error?.code, errorName: error?.name }, 'AI result store unavailable');
      return fallback;
    }
  }

  return Object.freeze({
    distributed: () => redisReady(),

    async get(key) {
      if (!redisReady()) return live(key)?.value ?? null;
      return guarded(async () => {
        const raw = await redis.get(key);
        return raw ? JSON.parse(raw) : null;
      }, null);
    },

    async set(key, value, ttlMs) {
      if (ttlMs <= 0) return;
      if (!redisReady()) return memorySet(key, value, ttlMs);
      await guarded(() => redis.set(key, JSON.stringify(value), 'PX', ttlMs), null);
    },

    async delete(key) {
      memory.delete(key);
      if (redisReady()) await guarded(() => redis.del(key), null);
    },

    async deleteByPrefix(prefix) {
      let removed = 0;
      for (const key of [...memory.keys()]) {
        if (key.startsWith(prefix)) {
          memory.delete(key);
          removed += 1;
        }
      }
      if (!redisReady()) return removed;
      return guarded(async () => {
        let cursor = '0';
        do {
          const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200);
          cursor = next;
          if (keys.length) removed += await redis.del(...keys);
        } while (cursor !== '0');
        return removed;
      }, removed);
    },

    /** Returns true when this caller now holds the lock. Without Redis there is nothing to share. */
    async acquireLock(key, token, ttlMs) {
      if (!redisReady()) return true;
      return guarded(async () => (await redis.set(key, token, 'PX', ttlMs, 'NX')) === 'OK', true);
    },

    async lockHolder(key) {
      if (!redisReady()) return null;
      return guarded(() => redis.get(key), null);
    },

    async releaseLock(key, token) {
      if (!redisReady()) return;
      await guarded(() => redis.eval(releaseScript, 1, key, token), null);
    },
  });
}

export const aiResultStore = createAiResultStore();
