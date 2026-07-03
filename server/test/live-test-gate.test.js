import assert from 'node:assert/strict';
import test from 'node:test';
import { createLiveTestGate, requireTestDatabase } from './support/live-test-gate.js';

test('live tests stay disabled when service credentials exist without explicit opt-in', () => {
  const gate = createLiveTestGate(
    { name: 'Example', requiredEnvironment: ['SERVICE_KEY'] },
    { SERVICE_KEY: 'configured' },
  );

  assert.equal(gate.enabled, false);
  assert.match(gate.skipReason, /ENABLE_LIVE_TESTS=true/);
});

test('live tests skip when explicitly enabled without all required credentials', () => {
  const gate = createLiveTestGate(
    { name: 'Example', requiredEnvironment: ['SERVICE_KEY', 'SERVICE_SECRET'] },
    { ENABLE_LIVE_TESTS: 'true', SERVICE_KEY: 'configured' },
  );

  assert.equal(gate.enabled, false);
  assert.match(gate.skipReason, /SERVICE_SECRET/);
});

test('live tests run only with explicit opt-in and all required credentials', () => {
  const gate = createLiveTestGate(
    { name: 'Example', requiredEnvironment: ['SERVICE_KEY'] },
    { ENABLE_LIVE_TESTS: 'true', SERVICE_KEY: 'configured' },
  );

  assert.deepEqual(gate, { enabled: true, skipReason: false });
});

test('MongoDB integration tests reject a database that is not isolated for tests', () => {
  const gate = requireTestDatabase(
    { enabled: true, skipReason: false },
    'mongodb://127.0.0.1:27017/tracer_ai',
  );

  assert.equal(gate.enabled, false);
  assert.match(gate.skipReason, /must end with _test/);
});
