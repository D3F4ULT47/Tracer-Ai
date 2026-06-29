import { Queue } from 'bullmq';
import { redis } from '../infrastructure/redis/redis.js';

const queueNames = Object.freeze({
  AI_RUNS: 'ai-runs',
  EXPORTS: 'exports',
  FILE_PROCESSING: 'file-processing',
  MAINTENANCE: 'maintenance',
  NOTIFICATIONS: 'notifications',
  RESOURCE_PROCESSING: 'resource-processing',
});

const queues = new Map();

export function getQueue(name) {
  if (!Object.values(queueNames).includes(name)) {
    throw new Error(`Unknown queue: ${name}`);
  }

  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, {
        connection: redis,
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: { age: 86_400, count: 1_000 },
          removeOnFail: false,
        },
      }),
    );
  }

  return queues.get(name);
}

export async function closeQueues() {
  await Promise.all([...queues.values()].map((queue) => queue.close()));
  queues.clear();
}

export { queueNames };
