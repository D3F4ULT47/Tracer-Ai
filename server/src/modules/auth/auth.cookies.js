import { env } from '../../config/env.js';

export const cookieNames = Object.freeze({
  access: 'tracer_access',
  refresh: 'tracer_refresh',
  csrf: 'tracer_csrf',
});

export const authCookieOptions = Object.freeze({
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE,
  path: '/',
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
});

export function setAuthCookies(response, { accessToken, refreshToken }) {
  response.cookie(cookieNames.access, accessToken, {
    ...authCookieOptions,
    httpOnly: true,
    maxAge: 15 * 60 * 1000,
  });
  response.cookie(cookieNames.refresh, refreshToken, {
    ...authCookieOptions,
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(response) {
  response.clearCookie(cookieNames.access, { ...authCookieOptions, httpOnly: true });
  response.clearCookie(cookieNames.refresh, { ...authCookieOptions, httpOnly: true });
}
