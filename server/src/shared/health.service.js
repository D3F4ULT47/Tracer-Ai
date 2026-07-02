import { env } from '../config/env.js';
import { getMongoHealth } from '../infrastructure/database/mongo.js';
import { getRedisHealth } from '../infrastructure/redis/redis.js';

export function getLivenessSnapshot() {
  return { status: 'live', timestamp: new Date().toISOString() };
}

export function getReadinessSnapshot() {
  const dependencies = {
    mongo: getMongoHealth(),
    redis: env.REDIS_ENABLED ? getRedisHealth() : { status: 'disabled' },
  };

  return {
    status: Object.values(dependencies).every((dependency) =>
      ['ready', 'disabled'].includes(dependency.status),
    )
      ? 'ready'
      : 'not_ready',
    dependencies,
  };
}
