import assert from 'node:assert/strict';
import test from 'node:test';
import { createErrorResponse, createSuccessResponse } from '../src/contracts/index.js';
import {
  ACTIVITY_ENDPOINTS,
  ASSESSMENT_ENDPOINTS,
  AUTH_ENDPOINTS,
  buildContractPath,
  CLARIFICATION_ENDPOINTS,
  COMMUNITY_ENDPOINTS,
  INPUT_ENDPOINTS,
  LEARNING_CONTEXT_ENDPOINTS,
  ROADMAP_PLANNING_ENDPOINTS,
  ROADMAP_WORKSPACE_ENDPOINTS,
  SOURCE_UNDERSTANDING_ENDPOINTS,
  USER_ENDPOINTS,
} from '../src/contracts/index.js';

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
  assert.equal(INPUT_ENDPOINTS.ingestResume.path, '/ai/inputs/resume');
  assert.equal(INPUT_ENDPOINTS.ingestDocument.path, '/ai/inputs/document');
  assert.equal(INPUT_ENDPOINTS.ingestText.auth, false);
  assert.equal(ASSESSMENT_ENDPOINTS.create.path, '/ai/assessments');
  assert.equal(ASSESSMENT_ENDPOINTS.create.auth, false);
  assert.equal(LEARNING_CONTEXT_ENDPOINTS.create.path, '/ai/learning-contexts');
  assert.equal(LEARNING_CONTEXT_ENDPOINTS.create.auth, false);
  assert.equal(CLARIFICATION_ENDPOINTS.decide.path, '/ai/clarifications/decide');
  assert.equal(CLARIFICATION_ENDPOINTS.respond.auth, false);
  assert.equal(ROADMAP_PLANNING_ENDPOINTS.preview.path, '/ai/roadmaps/preview');
  assert.equal(ROADMAP_PLANNING_ENDPOINTS.preview.auth, false);
  assert.equal(ROADMAP_PLANNING_ENDPOINTS.generate.path, '/ai/roadmaps/generate');
  assert.equal(ROADMAP_PLANNING_ENDPOINTS.generate.auth, true);
  assert.equal(ROADMAP_PLANNING_ENDPOINTS.generate.csrf, true);
  assert.equal(SOURCE_UNDERSTANDING_ENDPOINTS.create.path, '/ai/source-understanding');
  assert.equal(SOURCE_UNDERSTANDING_ENDPOINTS.create.auth, false);
  assert.equal(ROADMAP_WORKSPACE_ENDPOINTS.get.path, '/roadmaps/:roadmapId');
  assert.equal(ROADMAP_WORKSPACE_ENDPOINTS.updateNode.csrf, true);
  assert.equal(ROADMAP_WORKSPACE_ENDPOINTS.remove.method, 'DELETE');
  assert.equal(ROADMAP_WORKSPACE_ENDPOINTS.visibility.path, '/roadmaps/:roadmapId/visibility');
  assert.equal(ACTIVITY_ENDPOINTS.list.path, '/activity');
  assert.equal(ACTIVITY_ENDPOINTS.list.auth, true);
  assert.equal(COMMUNITY_ENDPOINTS.feed.path, '/community/feed');
  assert.equal(COMMUNITY_ENDPOINTS.feed.auth, false);
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
