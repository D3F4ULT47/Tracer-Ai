import { env } from '../../config/env.js';

export const cookieNames = Object.freeze({
  access: 'tracer_access',
  refresh: 'tracer_refresh',
  csrf: 'tracer_csrf',
});

const base = Object.freeze({ secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });

export function setAuthCookies(response, { accessToken, refreshToken }) {
  response.cookie(cookieNames.access, accessToken, {
    ...base,
    httpOnly: true,
    maxAge: 15 * 60 * 1000,
  });
  response.cookie(cookieNames.refresh, refreshToken, {
    ...base,
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(response) {
  response.clearCookie(cookieNames.access, { ...base, httpOnly: true });
  response.clearCookie(cookieNames.refresh, { ...base, httpOnly: true });
}
