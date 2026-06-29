import { registerEventHandlers } from './infrastructure/events/register-event-handlers.js';
import { processOutboxBatch } from './infrastructure/events/outbox.worker.js';
import { connectMongo, disconnectMongo } from './infrastructure/database/mongo.js';
import { logger } from './infrastructure/logging/logger.js';
import { processScheduledAccountDeletions } from './jobs/account-deletion.job.js';

let stopping = false;
registerEventHandlers();
await connectMongo();
logger.info('Tracer AI worker is running');
let lastMaintenanceAt = 0;

while (!stopping) {
  const processed = await processOutboxBatch();
  if (Date.now() - lastMaintenanceAt >= 60_000) {
    await processScheduledAccountDeletions();
    lastMaintenanceAt = Date.now();
  }
  await new Promise((resolve) => setTimeout(resolve, processed > 0 ? 100 : 1000));
}

async function shutdown(signal) {
  stopping = true;
  logger.info({ signal }, 'Worker shutdown started');
  await disconnectMongo();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
