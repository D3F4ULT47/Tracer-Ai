import { randomUUID } from 'node:crypto';

const EVENT_NAME_PATTERN = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;

export function createDomainEvent({
  name,
  aggregateId,
  aggregateType,
  payload = {},
  correlationId,
  causationId,
  schemaVersion = '1.0.0',
  occurredAt = new Date(),
}) {
  if (!EVENT_NAME_PATTERN.test(name)) {
    throw new Error('Domain event names must use bounded-context dot notation');
  }

  if (!aggregateId || !aggregateType) {
    throw new Error('Domain events require aggregateId and aggregateType');
  }

  return Object.freeze({
    id: randomUUID(),
    name,
    aggregateId,
    aggregateType,
    schemaVersion,
    occurredAt: occurredAt.toISOString(),
    correlationId: correlationId ?? null,
    causationId: causationId ?? null,
    payload: Object.freeze({ ...payload }),
  });
}
