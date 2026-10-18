import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import { aiResultStore } from '../../../infrastructure/cache/ai-result-store.js';
import { logger } from '../../../infrastructure/logging/logger.js';
import { AppError } from '../../../shared/app-error.js';
import { aiCallFingerprint, sha256 } from '../accounting/fingerprint.js';
import { aiConfig } from '../ai.config.js';
import { DATA_CLASSES, cancelledError } from '../providers/model-chain.js';
import { scopeKey } from './reuse-scope.js';

export const REUSE_OUTCOMES = Object.freeze({ HIT: 'cache_hit', SHARED: 'shared_in_flight' });

const ZERO_USAGE = Object.freeze({
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  totalTokens: 0,
});
const SHARED_RESULT_TTL_MS = 120_000;
const LOCK_HEADROOM_MS = 30_000;

const ajv = new Ajv2020({ allErrors: false, strict: false });
const schemaValidators = new Map();

function schemaValidator(schema, log) {
  const key = sha256(schema);
  if (!schemaValidators.has(key)) {
    try {
      schemaValidators.set(key, ajv.compile(schema));
    } catch (error) {
      log.warn({ errorName: error?.name }, 'AI reuse could not compile the output schema');
      schemaValidators.set(key, null);
    }
  }
  return schemaValidators.get(key);
}

/**
 * Inputs may carry per-request identifiers (for example a fresh `sourceId` per source) that the
 * model echoes in its output. Callers pass `reuse.input` without them for the fingerprint and
 * `reuse.ids` in a stable order; a cached output is rebound to the current identifiers.
 */
function rebind(value, ids) {
  const previous = value.ids ?? [];
  if (previous.length !== ids.length) return null;
  const mapping = new Map(previous.map((id, index) => [id, ids[index]]));
  const replace = (node) => {
    if (typeof node === 'string') return mapping.get(node) ?? node;
    if (Array.isArray(node)) return node.map(replace);
    if (node && typeof node === 'object') {
      return Object.fromEntries(Object.entries(node).map(([key, item]) => [key, replace(item)]));
    }
    return node;
  };
  return { ...value, ids, data: replace(value.data) };
}

function storedValue(result, request, ids) {
  return {
    data: result.data,
    ids,
    provider: result.provider ?? null,
    model: result.model ?? null,
    endpointClass: result.endpointClass ?? null,
    endpointHost: result.endpointHost ?? null,
    pricing: result.pricing ?? null,
    sourceRunId: request.metadata?.run_id ?? null,
  };
}

function sanitizedError(error) {
  return {
    message: error?.message ?? 'AI request failed',
    status: error?.status ?? 502,
    code: error?.code ?? 'AI_PROVIDER_ERROR',
    details: error?.details ?? null,
  };
}

function rebuildError(stored) {
  return new AppError(stored.message, {
    status: stored.status,
    code: stored.code,
    ...(stored.details ? { details: stored.details } : {}),
  });
}

function untilAborted(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(cancelledError());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(cancelledError());
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/**
 * Wraps a provider so that identical calls are paid for once: a cached result is reused, and a
 * call that is already running is joined instead of started again. Results are keyed by the
 * learner (or `public` for shareable sources) plus a fingerprint of prompt, schema, models and
 * input.
 */
export function createReuseLayer({
  store = aiResultStore,
  config = aiConfig.reuse,
  now = () => Date.now(),
  sleep = delay,
  pollMs = 1_000,
  sharedWaitMs = aiConfig.requestTimeoutMs * 2,
  log = logger,
} = {}) {
  const inflight = new Map();

  function accepts(value, request) {
    try {
      if (request.validate) {
        request.validate(value.data);
        return true;
      }
      const validator = request.schema ? schemaValidator(request.schema, log) : null;
      return validator ? validator(value.data) : false;
    } catch {
      return false;
    }
  }

  function reused(value, outcome, startedAt) {
    return Object.freeze({
      data: structuredClone(value.data),
      provider: value.provider,
      model: value.model,
      endpointClass: value.endpointClass,
      endpointHost: value.endpointHost,
      pricing: value.pricing,
      usage: ZERO_USAGE,
      latencyMs: now() - startedAt,
      providerRequestId: null,
      reuse: Object.freeze({ outcome, sourceRunId: value.sourceRunId }),
    });
  }

  async function waitForRemote({ sharedKey, lockKey, signal }) {
    const deadline = now() + sharedWaitMs;
    while (now() < deadline) {
      if (signal?.aborted) throw cancelledError();
      const shared = await store.get(sharedKey);
      if (shared) return shared;
      if (!(await store.lockHolder(lockKey))) return null;
      await sleep(pollMs);
    }
    return null;
  }

  function join(entry, signal) {
    entry.participants += 1;
    signal?.addEventListener(
      'abort',
      () => {
        entry.participants -= 1;
        if (entry.participants === 0) entry.controller.abort();
      },
      { once: true },
    );
  }

  function wrap(provider, { operation, scope, dataClass, models, cacheTtlSeconds = 0 }) {
    if (!scope || (!config.dedupEnabled && !config.resultCacheEnabled)) return provider;
    if (scope.kind === 'public' && dataClass !== DATA_CLASSES.GENERAL) {
      throw new Error('Personal data cannot be reused under the public scope');
    }
    const scoped = scopeKey(scope);
    const cacheTtlMs = config.resultCacheEnabled ? cacheTtlSeconds * 1_000 : 0;

    return Object.freeze({
      ...provider,
      async generateStructured({ reuse: reuseHints = null, ...request }) {
        const startedAt = now();
        const ids = reuseHints?.ids ?? [];
        const fingerprint = aiCallFingerprint({
          operation,
          scope: scoped,
          dataClass,
          models,
          instructions: request.instructions,
          schema: request.schema,
          input: reuseHints?.input ?? request.input,
        });
        const cacheKey = `ai:cache:${scoped}:${fingerprint}`;
        const sharedKey = `ai:shared:${scoped}:${fingerprint}`;
        const lockKey = `ai:inflight:${scoped}:${fingerprint}`;

        if (cacheTtlMs > 0) {
          const stored = await store.get(cacheKey);
          const cached = stored ? rebind(stored, ids) : null;
          if (cached && accepts(cached, request)) {
            return reused(cached, REUSE_OUTCOMES.HIT, startedAt);
          }
          if (stored) await store.delete(cacheKey);
        }

        const call = async (signal) => {
          const result = await provider.generateStructured({ ...request, signal });
          if (cacheTtlMs > 0) {
            await store.set(cacheKey, storedValue(result, request, ids), cacheTtlMs);
          }
          return result;
        };
        if (!config.dedupEnabled) return call(request.signal);

        const existing = inflight.get(fingerprint);
        if (existing) {
          join(existing, request.signal);
          try {
            const outcome = await untilAborted(existing.promise, request.signal);
            const shared = rebind(outcome.value, ids);
            if (!shared) throw new Error('A shared AI result could not be rebound to this request');
            return reused(shared, REUSE_OUTCOMES.SHARED, startedAt);
          } catch (error) {
            if (error?.code === 'AI_REQUEST_CANCELLED') throw error;
            throw rebuildError(sanitizedError(error));
          }
        }

        const entry = { participants: 0, controller: new AbortController(), promise: null };
        join(entry, request.signal);
        const token = randomUUID();
        entry.promise = (async () => {
          const distributed = store.distributed();
          let locked = false;
          try {
            if (distributed) {
              const lockTtl = sharedWaitMs + LOCK_HEADROOM_MS;
              locked = await store.acquireLock(lockKey, token, lockTtl);
              if (!locked) {
                const remote = await waitForRemote({ sharedKey, lockKey, signal: request.signal });
                if (remote?.error) throw rebuildError(remote.error);
                const value = remote?.value ? rebind(remote.value, ids) : null;
                if (value) return { value, result: null };
              }
            }
            try {
              const result = await call(entry.controller.signal);
              const value = storedValue(result, request, ids);
              if (distributed) await store.set(sharedKey, { value }, SHARED_RESULT_TTL_MS);
              return { value, result };
            } catch (error) {
              if (distributed) {
                await store.set(sharedKey, { error: sanitizedError(error) }, SHARED_RESULT_TTL_MS);
              }
              throw error;
            }
          } finally {
            inflight.delete(fingerprint);
            if (locked) await store.releaseLock(lockKey, token);
          }
        })();
        entry.promise.catch(() => {});
        inflight.set(fingerprint, entry);

        const outcome = await untilAborted(entry.promise, request.signal);
        return outcome.result ?? reused(outcome.value, REUSE_OUTCOMES.SHARED, startedAt);
      },
    });
  }

  return Object.freeze({
    wrap,
    async purgeScope(scope) {
      const scoped = scopeKey(scope);
      const removed = await Promise.all(
        ['cache', 'shared'].map((kind) => store.deleteByPrefix(`ai:${kind}:${scoped}:`)),
      );
      return removed.reduce((sum, count) => sum + count, 0);
    },
  });
}

export const aiReuseLayer = createReuseLayer();
