import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FeatureFlagService,
  LocalFeatureFlagProvider,
  reservedFlags,
} from '../src/infrastructure/feature-flags/feature-flag-service.js';
import { createDomainEvent } from '../src/infrastructure/events/domain-event.js';
import { requestContext } from '../src/middlewares/request-context.js';

test('feature flags use a provider and reject unknown flags safely', async () => {
  const service = new FeatureFlagService(
    new LocalFeatureFlagProvider({ [reservedFlags.VOICE]: true }),
  );

  assert.equal(await service.isEnabled(reservedFlags.VOICE), true);
  assert.equal(await service.isEnabled('unknown-flag'), false);
});

test('domain events contain immutable versioned metadata', () => {
  const event = createDomainEvent({
    name: 'roadmap.created',
    aggregateId: 'roadmap-id',
    aggregateType: 'roadmap',
  });

  assert.equal(event.schemaVersion, '1.0.0');
  assert.equal(Object.isFrozen(event), true);
  assert.equal(Object.isFrozen(event.payload), true);
});

test('request context rejects unsafe request identifiers', () => {
  const request = { get: () => 'invalid request id with spaces' };
  const headers = new Map();
  const response = { setHeader: (name, value) => headers.set(name, value) };
  let continued = false;

  requestContext(request, response, () => {
    continued = true;
  });

  assert.notEqual(request.id, 'invalid request id with spaces');
  assert.equal(headers.get('x-request-id'), request.id);
  assert.equal(continued, true);
});
