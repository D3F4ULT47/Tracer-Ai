import assert from 'node:assert/strict';
import test from 'node:test';
import { createErrorResponse, createSuccessResponse } from '../src/contracts/index.js';
import { AUTH_ENDPOINTS, buildContractPath, USER_ENDPOINTS } from '../src/contracts/index.js';

test('success response follows the shared envelope', () => {
  assert.deepEqual(createSuccessResponse({ data: { ok: true } }), {
    success: true,
    message: '',
    data: { ok: true },
  });
});

test('shared endpoint contracts drive route paths for server and client', () => {
  assert.equal(AUTH_ENDPOINTS.login.path, '/auth/login');
  assert.equal(USER_ENDPOINTS.profile.auth, true);
  assert.equal(
    buildContractPath('/auth/sessions/:sessionId', { sessionId: 'session 1' }),
    '/auth/sessions/session%201',
  );
});

test('error response follows the shared envelope', () => {
  assert.deepEqual(createErrorResponse({ message: 'Failed', code: 'TEST_ERROR' }), {
    success: false,
    message: 'Failed',
    error: { code: 'TEST_ERROR' },
  });
});
