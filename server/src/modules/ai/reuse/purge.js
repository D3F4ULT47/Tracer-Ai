import { logger } from '../../../infrastructure/logging/logger.js';
import { idempotencyRepository } from './idempotency.js';
import { aiReuseLayer } from './reusable-provider.js';
import { learnerScope, scopeKey } from './reuse-scope.js';

/**
 * Removes a deleted account's cached AI results and stored idempotent responses. Best effort:
 * entries that survive a failure still expire on their own TTL.
 */
export async function purgeLearnerReuseData(
  ownerId,
  { reuse = aiReuseLayer, idempotency = idempotencyRepository, log = logger } = {},
) {
  const scope = learnerScope({ ownerId });
  const results = await Promise.allSettled([
    reuse.purgeScope(scope),
    idempotency.deleteScope(scopeKey(scope)),
  ]);
  for (const result of results) {
    if (result.status === 'rejected') {
      log.warn({ errorName: result.reason?.name }, 'AI reuse purge was incomplete');
    }
  }
}
