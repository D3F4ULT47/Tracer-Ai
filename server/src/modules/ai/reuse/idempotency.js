import { setTimeout as delay } from 'node:timers/promises';
import { logger } from '../../../infrastructure/logging/logger.js';
import { AppError } from '../../../shared/app-error.js';
import { sha256 } from '../accounting/fingerprint.js';
import { aiConfig } from '../ai.config.js';
import { AiIdempotencyKey } from '../models/ai-idempotency-key.model.js';
import { requestScope, scopeKey } from './reuse-scope.js';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
export const REPLAYED_HEADER = 'Idempotent-Replayed';

const keyPattern = /^[A-Za-z0-9._:-]{8,128}$/;
const POLL_MS = 500;
/** Body members that differ between retries of the same action and do not change the result. */
const volatileBodyFields = new Set(['generationSessionId']);

export const idempotencyRepository = Object.freeze({
  async claim({ scope, endpoint, key, fingerprint, expiresAt }) {
    try {
      const record = await AiIdempotencyKey.create({
        scope,
        endpoint,
        key,
        fingerprint,
        expiresAt,
      });
      return { record, created: true };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      return {
        record: await AiIdempotencyKey.findOne({ scope, endpoint, key }).lean(),
        created: false,
      };
    }
  },
  find({ scope, endpoint, key }) {
    return AiIdempotencyKey.findOne({ scope, endpoint, key }).lean();
  },
  async reclaimFailed(id, expiresAt) {
    const result = await AiIdempotencyKey.updateOne(
      { _id: id, status: 'failed' },
      { $set: { status: 'processing', responseStatus: null, responseBody: null, expiresAt } },
    );
    return result.modifiedCount === 1;
  },
  async reclaimStale(id, staleBefore, expiresAt) {
    const result = await AiIdempotencyKey.updateOne(
      { _id: id, status: 'processing', updatedAt: { $lt: staleBefore } },
      { $set: { expiresAt } },
    );
    return result.modifiedCount === 1;
  },
  complete(id, responseStatus, body) {
    return AiIdempotencyKey.updateOne(
      { _id: id },
      { $set: { status: 'completed', responseStatus, responseBody: JSON.stringify(body) } },
    );
  },
  fail(id) {
    return AiIdempotencyKey.updateOne({ _id: id }, { $set: { status: 'failed' } });
  },
  deleteScope(scope) {
    return AiIdempotencyKey.deleteMany({ scope });
  },
});

function requestFingerprint(endpoint, body) {
  const stable =
    body && typeof body === 'object' && !Array.isArray(body)
      ? Object.fromEntries(Object.entries(body).filter(([name]) => !volatileBodyFields.has(name)))
      : body;
  return sha256({ endpoint, body: stable ?? null });
}

/**
 * ADR 0001 AI-5: a repeated `Idempotency-Key` returns the original response instead of running
 * the AI call again. Requests without the header behave exactly as before. Records expire after
 * the configured TTL; failed responses are not replayed, so a retry after a failure runs again.
 * A record still `processing` after twice the wait limit is treated as abandoned and reclaimed.
 */
export function idempotent(
  endpoint,
  {
    repository = idempotencyRepository,
    config = aiConfig.reuse,
    now = () => Date.now(),
    sleep = delay,
    log = logger,
  } = {},
) {
  async function waitForResult(lookup) {
    const deadline = now() + config.idempotencyWaitMs;
    while (now() < deadline) {
      await sleep(POLL_MS);
      const record = await repository.find(lookup);
      if (!record || record.status !== 'processing') return { record, timedOut: false };
    }
    return { record: null, timedOut: true };
  }

  function replay(response, record) {
    response.set(REPLAYED_HEADER, 'true');
    response.status(record.responseStatus).json(JSON.parse(record.responseBody));
  }

  /**
   * Settles the record from the response the handler writes, not from the connection: a client
   * that disconnects mid-generation must still be able to replay the result when it retries.
   */
  function track(response, id) {
    const sendJson = response.json.bind(response);
    let settled = false;
    response.json = (payload) => {
      if (!settled) {
        settled = true;
        const write =
          payload?.success === true && response.statusCode < 400
            ? repository.complete(id, response.statusCode, payload)
            : repository.fail(id);
        Promise.resolve(write).catch((error) =>
          log.warn({ errorName: error?.name }, 'Idempotency record could not be updated'),
        );
      }
      return sendJson(payload);
    };
  }

  return async function idempotencyMiddleware(request, response, next) {
    const key = request.get(IDEMPOTENCY_HEADER);
    if (!config.idempotencyEnabled || key === undefined) return next();
    if (!keyPattern.test(key)) {
      return next(
        new AppError('Idempotency-Key must be 8 to 128 letters, digits or ._:-', {
          status: 400,
          code: 'IDEMPOTENCY_KEY_INVALID',
        }),
      );
    }

    const scope = requestScope(request);
    const lookup = { scope: scope ? scopeKey(scope) : 'anonymous', endpoint, key };
    const fingerprint = requestFingerprint(endpoint, request.body);
    const expiresAt = () => new Date(now() + config.idempotencyTtlSeconds * 1_000);

    try {
      let { record, created } = await repository.claim({
        ...lookup,
        fingerprint,
        expiresAt: expiresAt(),
      });
      while (!created) {
        if (!record) {
          ({ record, created } = await repository.claim({
            ...lookup,
            fingerprint,
            expiresAt: expiresAt(),
          }));
          continue;
        }
        if (record.fingerprint !== fingerprint) {
          throw new AppError('This Idempotency-Key was already used for a different request', {
            status: 422,
            code: 'IDEMPOTENCY_KEY_REUSED',
          });
        }
        if (record.status === 'completed') return replay(response, record);
        if (record.status === 'failed') {
          created = await repository.reclaimFailed(record._id, expiresAt());
          if (!created) record = await repository.find(lookup);
          continue;
        }
        const staleBefore = new Date(now() - config.idempotencyWaitMs * 2);
        if (new Date(record.updatedAt) < staleBefore) {
          created = await repository.reclaimStale(record._id, staleBefore, expiresAt());
          if (!created) record = await repository.find(lookup);
          continue;
        }
        const waited = await waitForResult(lookup);
        record = waited.record;
        if (waited.timedOut) {
          throw new AppError('The original request with this Idempotency-Key is still running', {
            status: 409,
            code: 'IDEMPOTENT_REQUEST_IN_PROGRESS',
          });
        }
      }
      track(response, record._id);
      return next();
    } catch (error) {
      if (error instanceof AppError) return next(error);
      log.warn({ errorName: error?.name }, 'Idempotency store unavailable; continuing without it');
      return next();
    }
  };
}
