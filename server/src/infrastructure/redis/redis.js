import IORedis from 'ioredis';
import { env } from '../../config/env.js';
import { logger } from '../logging/logger.js';

export const redis = new IORedis(env.REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  connectTimeout: 5_000,
  retryStrategy: (attempt) => Math.min(attempt * 250, 5_000),
});

let hasLoggedConnectionError = false;

redis.on('error', (error) => {
  const log = hasLoggedConnectionError ? logger.debug.bind(logger) : logger.warn.bind(logger);
  log({ err: error }, 'Redis connection error');
  hasLoggedConnectionError = true;
});

redis.on('ready', () => {
  hasLoggedConnectionError = false;
});

export async function connectRedis() {
  if (redis.status === 'wait') {
    const attempt = redis.connect();
    let timeout;

    try {
      await Promise.race([
        attempt,
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Redis initial connection timed out')),
            5_000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  }

  if (redis.status === 'ready') {
    logger.info('Redis connection established');
  }

  return redis;
}

export async function disconnectRedis() {
  if (redis.status === 'wait') {
    redis.disconnect();
  } else if (redis.status !== 'end') {
    await redis.quit();
  }
}

export function getRedisHealth() {
  return {
    status: redis.status === 'ready' ? 'ready' : 'not_ready',
    connectionStatus: redis.status,
  };
}
