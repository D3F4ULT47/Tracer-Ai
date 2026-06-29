import { createHmac, randomBytes } from 'node:crypto';
import { env } from '../../../config/env.js';
import { AppError } from '../../../shared/app-error.js';
import { cookieNames } from '../auth.cookies.js';
import { tokenService } from '../token.service.js';

function sign(value) {
  if (!env.CSRF_SECRET) throw new Error('CSRF_SECRET is required for authentication');
  return createHmac('sha256', env.CSRF_SECRET).update(value).digest('base64url');
}

export function issueCsrfToken(response) {
  const nonce = randomBytes(32).toString('base64url');
  const token = `${nonce}.${sign(nonce)}`;
  response.cookie(cookieNames.csrf, token, {
    httpOnly: false,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
  return token;
}

export function requireCsrf(request, _response, next) {
  const cookie = request.cookies[cookieNames.csrf];
  const header = request.get('x-csrf-token');
  const [nonce, signature] = String(cookie ?? '').split('.');
  if (
    !cookie ||
    cookie !== header ||
    !nonce ||
    !signature ||
    !tokenService.safeEqual(signature, sign(nonce))
  ) {
    next(new AppError('CSRF validation failed', { status: 403, code: 'CSRF_VALIDATION_FAILED' }));
    return;
  }
  next();
}
