import { env } from '../config/env.js';
import { connectMongo, disconnectMongo } from './database/mongo.js';
import { logger } from './logging/logger.js';
import { connectRedis, disconnectRedis } from './redis/redis.js';
import { closeQueues } from '../queues/queue-factory.js';
import { validateRuntimeConfiguration } from './startup/startup-validation.js';

export async function initializeInfrastructure() {
  validateRuntimeConfiguration();
  await connectMongo();
  if (env.REDIS_ENABLED) await connectRedis();
  logger.info('Runtime configuration and required infrastructure validated');
}

export async function shutdownInfrastructure() {
  await closeQueues();
  await Promise.allSettled([...(env.REDIS_ENABLED ? [disconnectRedis()] : []), disconnectMongo()]);
}
