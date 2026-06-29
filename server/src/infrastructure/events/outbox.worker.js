import { logger } from '../logging/logger.js';
import { eventHandlerRegistry } from './event-handler-registry.js';
import { OutboxEvent } from './outbox-event.model.js';

export async function processOutboxBatch(limit = 50) {
  let processed = 0;
  while (processed < limit) {
    const record = await OutboxEvent.findOneAndUpdate(
      { status: { $in: ['pending', 'failed'] }, nextAttemptAt: { $lte: new Date() } },
      { $set: { status: 'processing' }, $inc: { attempts: 1 } },
      { new: true, sort: { occurredAt: 1 } },
    );
    if (!record) break;
    try {
      for (const handler of eventHandlerRegistry.get(record.name)) await handler(record.toObject());
      record.status = 'processed';
      record.processedAt = new Date();
      record.lastError = undefined;
    } catch (error) {
      record.status = 'failed';
      record.lastError = error.message.slice(0, 500);
      record.nextAttemptAt = new Date(Date.now() + Math.min(60_000, 1000 * 2 ** record.attempts));
      logger.error({ err: error, eventId: record.eventId }, 'Outbox event processing failed');
    }
    await record.save();
    processed += 1;
  }
  return processed;
}
