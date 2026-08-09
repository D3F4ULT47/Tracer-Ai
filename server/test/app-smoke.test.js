import assert from 'node:assert/strict';
import test from 'node:test';
import { AUTH_ENDPOINTS } from '@tracer-ai/shared/contracts';
import { createApp } from '../src/app.js';
import { registerContractRoute } from '../src/shared/contract-route.js';

function collectRoutePaths(stack, paths = []) {
  for (const layer of stack ?? []) {
    if (layer.route?.path) paths.push(layer.route.path);
    if (layer.handle?.stack) collectRoutePaths(layer.handle.stack, paths);
  }
  return paths;
}

test('assessment route and its shared validators compile into the application', () => {
  const app = createApp();
  const paths = collectRoutePaths(app.router?.stack);

  assert.ok(paths.includes('/ai/assessments'));
  assert.ok(paths.includes('/ai/learning-contexts'));
  assert.ok(paths.includes('/ai/clarifications/decide'));
  assert.ok(paths.includes('/ai/clarifications/respond'));
  assert.ok(paths.includes('/ai/roadmaps/generate'));
  assert.ok(paths.includes('/ai/roadmaps/preview'));
  assert.ok(paths.includes('/roadmaps'));
  assert.ok(paths.includes('/roadmaps/:roadmapId'));
  assert.ok(paths.includes('/roadmaps/:roadmapId/adopt'));
  assert.ok(paths.includes('/roadmaps/:roadmapId/nodes/:nodeType/:nodeKey'));
});

test('request validation does not apply response schemas to incoming requests', () => {
  let routeHandlers;
  const router = {
    get(_path, ...handlers) {
      routeHandlers = handlers;
    },
  };
  registerContractRoute(router, AUTH_ENDPOINTS.csrf, () => {});
  let continued = false;
  routeHandlers[0]({ body: undefined, params: {} }, {}, () => {
    continued = true;
  });

  assert.equal(continued, true);
});
