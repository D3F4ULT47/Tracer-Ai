import { connectMongo, disconnectMongo } from './database/mongo.js';
import { logger } from './logging/logger.js';
import { connectRedis, disconnectRedis } from './redis/redis.js';
import { closeQueues } from '../queues/queue-factory.js';

export async function initializeInfrastructure() {
  const results = await Promise.allSettled([connectMongo(), connectRedis()]);

  for (const result of results) {
    if (result.status === 'rejected') {
      logger.warn({ err: result.reason }, 'Infrastructure dependency is not ready');
    }
  }
}

export async function shutdownInfrastructure() {
  await closeQueues();
  await Promise.allSettled([disconnectRedis(), disconnectMongo()]);
}
