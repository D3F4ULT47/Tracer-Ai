import assert from 'node:assert/strict';
import test from 'node:test';
import { createGenerationProgressService } from '../src/modules/ai/roadmap-planning/generation-progress.service.js';

test('generation progress is monotonic and marks workspace readiness complete', () => {
  let time = new Date('2026-07-05T12:00:00.000Z');
  const service = createGenerationProgressService({ now: () => time });
  const sessionId = '11111111-1111-4111-8111-111111111111';

  service.update(sessionId, 'roadmap_planning');
  time = new Date('2026-07-05T12:00:01.000Z');
  service.update(sessionId, 'resource_ranking');
  service.update(sessionId, 'resource_discovery');

  assert.equal(service.get(sessionId).stage, 'resource_ranking');
  assert.equal(service.get(sessionId).percentage, 77);

  service.update(sessionId, 'workspace_ready');
  assert.equal(service.get(sessionId).status, 'complete');
  assert.equal(service.get(sessionId).percentage, 100);
});

test('progress written on one instance is readable on another through the shared store', async () => {
  const shared = new Map();
  const store = {
    distributed: () => true,
    async set(key, value) {
      shared.set(key, value);
    },
    async get(key) {
      return shared.get(key) ?? null;
    },
  };
  const writer = createGenerationProgressService({ store });
  const reader = createGenerationProgressService({ store });
  const sessionId = '33333333-3333-4333-8333-333333333333';

  writer.update(sessionId, 'resource_discovery');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal((await reader.read(sessionId)).stage, 'resource_discovery');
  await assert.rejects(
    reader.read('44444444-4444-4444-8444-444444444444'),
    (error) => error.code === 'GENERATION_PROGRESS_NOT_FOUND',
  );
});

test('generation progress preserves a failed stage for recovery UI', () => {
  const service = createGenerationProgressService();
  const sessionId = '22222222-2222-4222-8222-222222222222';

  service.update(sessionId, 'roadmap_validation', 'failed');

  assert.deepEqual(
    { stage: service.get(sessionId).stage, status: service.get(sessionId).status },
    { stage: 'roadmap_validation', status: 'failed' },
  );
});
