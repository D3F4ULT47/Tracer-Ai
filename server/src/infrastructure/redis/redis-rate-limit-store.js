import { redis } from './redis.js';

/** express-rate-limit store shared by every API instance through Redis. */
export class RedisRateLimitStore {
  constructor(prefix) {
    this.prefix = prefix;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const redisKey = `${this.prefix}:${key}`;
    const [totalHits, ttl] = await redis.eval(
      "local count=redis.call('INCR',KEYS[1]); if count==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; return {count,redis.call('PTTL',KEYS[1])}",
      1,
      redisKey,
      this.windowMs,
    );
    return { totalHits, resetTime: new Date(Date.now() + Math.max(Number(ttl), 0)) };
  }

  async decrement(key) {
    await redis.decr(`${this.prefix}:${key}`);
  }

  async resetKey(key) {
    await redis.del(`${this.prefix}:${key}`);
  }
}
