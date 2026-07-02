import { rateLimit } from 'express-rate-limit';

export const aiGenerationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: (request) => (request.auth?.userId ? 60 : 10),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Roadmap generation is temporarily limited. Please try again later.',
    error: { code: 'AI_RATE_LIMITED' },
  },
});
