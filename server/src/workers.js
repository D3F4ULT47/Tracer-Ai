import { registerEventHandlers } from './infrastructure/events/register-event-handlers.js';
import { processOutboxBatch } from './infrastructure/events/outbox.worker.js';
import { connectMongo, disconnectMongo } from './infrastructure/database/mongo.js';
import { logger } from './infrastructure/logging/logger.js';
import { connectRedis, disconnectRedis } from './infrastructure/redis/redis.js';
import { env } from './config/env.js';
import { processScheduledAccountDeletions } from './jobs/account-deletion.job.js';

let stopping = false;
registerEventHandlers();
await connectMongo();
if (env.REDIS_ENABLED)
  await connectRedis().catch((error) => logger.warn({ err: error }, 'Worker Redis unavailable'));
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
  await Promise.allSettled([...(env.REDIS_ENABLED ? [disconnectRedis()] : []), disconnectMongo()]);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
