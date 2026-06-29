import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { AppError } from '../../shared/app-error.js';

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function configuredSecret() {
  if (!env.TOKEN_HASH_SECRET) throw new Error('TOKEN_HASH_SECRET is required for authentication');
  return env.TOKEN_HASH_SECRET;
}

function decodeKey(value, name) {
  if (!value) throw new Error(`${name} is required for authentication`);
  return Buffer.from(value, 'base64').toString('utf8');
}

export const tokenService = Object.freeze({
  hash(value) {
    return createHmac('sha256', configuredSecret()).update(value).digest('hex');
  },
  randomToken() {
    return randomBytes(48).toString('base64url');
  },
  createAccessToken({ userId, sessionId }) {
    return jwt.sign(
      { sid: sessionId },
      decodeKey(env.JWT_PRIVATE_KEY_BASE64, 'JWT_PRIVATE_KEY_BASE64'),
      {
        algorithm: 'RS256',
        audience: 'tracer-ai-client',
        expiresIn: ACCESS_TTL_SECONDS,
        issuer: 'tracer-ai-api',
        keyid: env.JWT_KEY_ID,
        subject: String(userId),
      },
    );
  },
  verifyAccessToken(value) {
    try {
      return jwt.verify(value, decodeKey(env.JWT_PUBLIC_KEY_BASE64, 'JWT_PUBLIC_KEY_BASE64'), {
        algorithms: ['RS256'],
        audience: 'tracer-ai-client',
        issuer: 'tracer-ai-api',
      });
    } catch {
      throw new AppError('Authentication required', {
        status: 401,
        code: 'AUTHENTICATION_REQUIRED',
      });
    }
  },
  createRefreshToken() {
    const value = this.randomToken();
    return {
      value,
      hash: this.hash(value),
      familyId: randomUUID(),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    };
  },
  safeEqual(left, right) {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && timingSafeEqual(a, b);
  },
});
