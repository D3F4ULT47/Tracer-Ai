import { getMongoHealth } from '../infrastructure/database/mongo.js';
import { getRedisHealth } from '../infrastructure/redis/redis.js';

export function getLivenessSnapshot() {
  return { status: 'live', timestamp: new Date().toISOString() };
}

export function getReadinessSnapshot() {
  const dependencies = {
    mongo: getMongoHealth(),
    redis: getRedisHealth(),
  };

  return {
    status: Object.values(dependencies).every((dependency) => dependency.status === 'ready')
      ? 'ready'
      : 'not_ready',
    dependencies,
  };
}
