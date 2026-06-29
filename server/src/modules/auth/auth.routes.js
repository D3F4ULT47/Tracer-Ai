import { AUTH_ENDPOINTS } from '@tracer-ai/shared/contracts';
import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { registerContractRoute } from '../../shared/contract-route.js';
import { authController } from './auth.controller.js';
import { authenticate } from './middlewares/authenticate.js';
import { getAuthRateLimit } from './middlewares/auth-rate-limits.js';
import { requireCsrf } from './middlewares/csrf.js';

export const authRouter = Router();

const handlers = {
  csrf: authController.csrf,
  register: authController.register,
  login: authController.login,
  refresh: authController.refresh,
  logout: authController.logout,
  logoutAll: authController.logoutAll,
  verifyEmail: authController.verifyEmail,
  resendVerification: authController.resendVerification,
  forgotPassword: authController.forgotPassword,
  resetPassword: authController.resetPassword,
  sessions: authController.sessions,
  revokeSession: authController.revokeSession,
  oauthStart: authController.oauthStart,
  oauthCallback: authController.oauthCallback,
};

for (const [key, contract] of Object.entries(AUTH_ENDPOINTS)) {
  const middleware = [
    getAuthRateLimit(key),
    contract.auth && authenticate,
    contract.csrf && requireCsrf,
  ].filter(Boolean);
  registerContractRoute(authRouter, contract, ...middleware, asyncHandler(handlers[key]));
}
