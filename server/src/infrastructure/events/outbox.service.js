import { createDomainEvent } from './domain-event.js';
import { OutboxEvent } from './outbox-event.model.js';

export async function appendOutboxEvent(definition, session) {
  const event = createDomainEvent(definition);
  await OutboxEvent.create(
    [{ ...event, eventId: event.id, occurredAt: new Date(event.occurredAt) }],
    session ? { session } : undefined,
  );
  return event;
}
