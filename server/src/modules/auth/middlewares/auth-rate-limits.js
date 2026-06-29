import { rateLimit } from 'express-rate-limit';
import { redis } from '../../../infrastructure/redis/redis.js';

class RedisRateLimitStore {
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

function createLimit(name, windowMs, limit) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    store: new RedisRateLimitStore(`rate-limit:auth:${name}`),
    message: {
      success: false,
      message: 'Too many authentication requests. Try again later.',
      error: { code: 'RATE_LIMITED' },
    },
  });
}

const strict = createLimit('strict', 15 * 60 * 1000, 10);
const registration = createLimit('registration', 60 * 60 * 1000, 5);
const recovery = createLimit('recovery', 15 * 60 * 1000, 5);
const session = createLimit('session', 15 * 60 * 1000, 60);

export function getAuthRateLimit(contractKey) {
  if (contractKey === 'register') return registration;
  if (
    ['forgotPassword', 'resetPassword', 'resendVerification', 'verifyEmail'].includes(contractKey)
  )
    return recovery;
  if (['login', 'oauthStart', 'oauthCallback'].includes(contractKey)) return strict;
  return session;
}
