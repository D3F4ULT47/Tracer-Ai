import { rateLimit } from 'express-rate-limit';
import { env } from '../../../config/env.js';
import { RedisRateLimitStore } from '../../../infrastructure/redis/redis-rate-limit-store.js';

function createLimit(name, windowMs, limit) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ...(env.REDIS_ENABLED ? { store: new RedisRateLimitStore(`rate-limit:auth:${name}`) } : {}),
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
