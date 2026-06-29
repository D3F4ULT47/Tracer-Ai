import { defineEndpoint } from './endpoint.js';

const email = { type: 'string', format: 'email', maxLength: 254 };
const password = { type: 'string', minLength: 12, maxLength: 128 };
const token = { type: 'string', minLength: 32, maxLength: 2048 };
const publicUser = {
  type: 'object',
  required: ['id', 'email', 'emailVerified', 'status', 'connectedAccounts'],
  properties: {
    id: { type: 'string' },
    email,
    emailVerified: { type: 'boolean' },
    status: { type: 'string' },
    connectedAccounts: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: false,
};
const userData = {
  type: 'object',
  required: ['user'],
  properties: { user: publicUser },
  additionalProperties: false,
};

export const AUTH_ENDPOINTS = Object.freeze({
  csrf: defineEndpoint({
    id: 'auth.csrf',
    method: 'GET',
    path: '/auth/csrf',
    dataSchema: {
      type: 'object',
      required: ['csrfToken'],
      properties: { csrfToken: { type: 'string' } },
      additionalProperties: false,
    },
  }),
  register: defineEndpoint({
    id: 'auth.register',
    method: 'POST',
    path: '/auth/register',
    csrf: true,
    dataSchema: userData,
    bodySchema: {
      type: 'object',
      required: ['email', 'password', 'name'],
      properties: { email, password, name: { type: 'string', minLength: 1, maxLength: 100 } },
      additionalProperties: false,
    },
  }),
  login: defineEndpoint({
    id: 'auth.login',
    method: 'POST',
    path: '/auth/login',
    csrf: true,
    dataSchema: userData,
    bodySchema: {
      type: 'object',
      required: ['email', 'password'],
      properties: { email, password },
      additionalProperties: false,
    },
  }),
  refresh: defineEndpoint({
    id: 'auth.refresh',
    method: 'POST',
    path: '/auth/refresh',
    csrf: true,
    dataSchema: userData,
  }),
  logout: defineEndpoint({
    id: 'auth.logout',
    method: 'POST',
    path: '/auth/logout',
    auth: true,
    csrf: true,
  }),
  logoutAll: defineEndpoint({
    id: 'auth.logout-all',
    method: 'POST',
    path: '/auth/logout-all',
    auth: true,
    csrf: true,
  }),
  verifyEmail: defineEndpoint({
    id: 'auth.verify-email',
    method: 'POST',
    path: '/auth/verify-email',
    csrf: true,
    bodySchema: {
      type: 'object',
      required: ['token'],
      properties: { token },
      additionalProperties: false,
    },
  }),
  resendVerification: defineEndpoint({
    id: 'auth.resend-verification',
    method: 'POST',
    path: '/auth/resend-verification',
    csrf: true,
    bodySchema: {
      type: 'object',
      required: ['email'],
      properties: { email },
      additionalProperties: false,
    },
  }),
  forgotPassword: defineEndpoint({
    id: 'auth.forgot-password',
    method: 'POST',
    path: '/auth/forgot-password',
    csrf: true,
    bodySchema: {
      type: 'object',
      required: ['email'],
      properties: { email },
      additionalProperties: false,
    },
  }),
  resetPassword: defineEndpoint({
    id: 'auth.reset-password',
    method: 'POST',
    path: '/auth/reset-password',
    csrf: true,
    bodySchema: {
      type: 'object',
      required: ['token', 'password'],
      properties: { token, password },
      additionalProperties: false,
    },
  }),
  oauthStart: defineEndpoint({
    id: 'auth.oauth-start',
    method: 'GET',
    path: '/auth/oauth/:provider',
    paramsSchema: {
      type: 'object',
      required: ['provider'],
      properties: { provider: { enum: ['google'] } },
      additionalProperties: false,
    },
  }),
  oauthCallback: defineEndpoint({
    id: 'auth.oauth-callback',
    method: 'GET',
    path: '/auth/oauth/:provider/callback',
  }),
  sessions: defineEndpoint({
    id: 'auth.sessions',
    method: 'GET',
    path: '/auth/sessions',
    auth: true,
    dataSchema: {
      type: 'object',
      required: ['sessions', 'currentSessionId'],
      properties: {
        sessions: { type: 'array', items: { type: 'object' } },
        currentSessionId: { type: 'string' },
      },
      additionalProperties: false,
    },
  }),
  revokeSession: defineEndpoint({
    id: 'auth.revoke-session',
    method: 'DELETE',
    path: '/auth/sessions/:sessionId',
    auth: true,
    csrf: true,
  }),
});
