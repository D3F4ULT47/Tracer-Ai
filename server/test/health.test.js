import assert from 'node:assert/strict';
import test from 'node:test';
import { getLivenessSnapshot, getReadinessSnapshot } from '../src/shared/health.service.js';

test('liveness snapshot reports a live process', () => {
  const snapshot = getLivenessSnapshot();

  assert.equal(snapshot.status, 'live');
  assert.ok(snapshot.timestamp);
});

test('readiness snapshot reports unavailable dependencies', () => {
  const snapshot = getReadinessSnapshot();

  assert.equal(snapshot.status, 'not_ready');
  assert.equal(snapshot.dependencies.mongo.status, 'not_ready');
  assert.equal(snapshot.dependencies.redis.status, 'not_ready');
});
