import { createSuccessResponse } from '@tracer-ai/shared/contracts';
import { env } from '../../config/env.js';
import { clearAuthCookies, cookieNames, setAuthCookies } from './auth.cookies.js';
import { authService } from './auth.service.js';
import { issueCsrfToken } from './middlewares/csrf.js';
import { oauthService } from './oauth/oauth.service.js';

function context(request) {
  return { requestId: request.id, userAgent: request.get('user-agent'), ipAddress: request.ip };
}

function success(response, request, message, data = {}) {
  response.json(createSuccessResponse({ message, data, requestId: request.id }));
}

export const authController = Object.freeze({
  csrf(request, response) {
    success(response, request, 'CSRF token issued', { csrfToken: issueCsrfToken(response) });
  },
  async register(request, response) {
    const user = await authService.register(request.body, context(request));
    response.status(201);
    success(response, request, 'Account created. Check your email to verify it.', { user });
  },
  async login(request, response) {
    const result = await authService.login(request.body, context(request));
    setAuthCookies(response, result);
    success(response, request, 'Signed in', { user: result.user });
  },
  async refresh(request, response) {
    const result = await authService.refresh(
      request.cookies[cookieNames.refresh],
      context(request),
    );
    setAuthCookies(response, result);
    success(response, request, 'Session refreshed', { user: result.user });
  },
  async logout(request, response) {
    await authService.logout(request.auth.sessionId);
    clearAuthCookies(response);
    success(response, request, 'Signed out');
  },
  async logoutAll(request, response) {
    await authService.logoutAll(request.auth.userId);
    clearAuthCookies(response);
    success(response, request, 'All sessions revoked');
  },
  async verifyEmail(request, response) {
    await authService.verifyEmail(request.body.token);
    success(response, request, 'Email verified');
  },
  async resendVerification(request, response) {
    await authService.resendVerification(request.body.email);
    success(response, request, 'If verification is required, an email has been sent');
  },
  async forgotPassword(request, response) {
    await authService.requestPasswordReset(request.body.email);
    success(response, request, 'If the account exists, a reset email has been sent');
  },
  async resetPassword(request, response) {
    await authService.resetPassword(request.body.token, request.body.password);
    clearAuthCookies(response);
    success(response, request, 'Password reset. Sign in again.');
  },
  async sessions(request, response) {
    const sessions = await authService.listSessions(request.auth.userId);
    success(response, request, 'Sessions retrieved', {
      sessions,
      currentSessionId: request.auth.sessionId,
    });
  },
  async revokeSession(request, response) {
    await authService.revokeSession(request.auth.userId, request.params.sessionId);
    success(response, request, 'Session revoked');
  },
  async oauthStart(request, response) {
    response.redirect(await oauthService.start(request.params.provider, response));
  },
  async oauthCallback(request, response) {
    const currentUrl = new URL(request.originalUrl, `${request.protocol}://${request.get('host')}`);
    const identity = await oauthService.callback(
      request.params.provider,
      currentUrl,
      request.cookies[oauthService.cookieName],
      response,
    );
    const result = await authService.authenticateOAuth(identity, context(request));
    setAuthCookies(response, result);
    response.redirect(new URL('/oauth/callback?status=success', env.APP_URL).toString());
  },
});
