import { rateLimit } from 'express-rate-limit';
import { env } from '../../config/env.js';
import { RedisRateLimitStore } from '../../infrastructure/redis/redis-rate-limit-store.js';

export const aiGenerationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: (request) => (request.auth?.userId ? 60 : 10),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  ...(env.REDIS_ENABLED
    ? { store: new RedisRateLimitStore('rate-limit:ai:generation'), passOnStoreError: true }
    : {}),
  message: {
    success: false,
    message: 'Roadmap generation is temporarily limited. Please try again later.',
    error: { code: 'AI_RATE_LIMITED' },
  },
});
