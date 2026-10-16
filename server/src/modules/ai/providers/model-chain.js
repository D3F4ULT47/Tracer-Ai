import { AppError } from '../../../shared/app-error.js';
import { defineAiProvider } from './ai-provider.js';
import {
  circuitBreaker as defaultCircuitBreaker,
  freeQuotaTracker as defaultFreeQuotaTracker,
} from './availability.js';
import { eligibilityOf } from './model-eligibility.js';

export const DATA_CLASSES = Object.freeze({ PERSONAL: 'personal', GENERAL: 'general' });

const fallbackErrorCodes = new Set([
  'AI_RATE_LIMITED',
  'AI_PROVIDER_UNAVAILABLE',
  'AI_PROVIDER_TIMEOUT',
  'AI_CREDITS_EXHAUSTED',
  'AI_MODEL_UNAVAILABLE',
  'AI_EMPTY_RESPONSE',
  'AI_INVALID_JSON',
  'AI_FREE_QUOTA_EXHAUSTED',
]);

const validationErrorCodes = new Set([
  'AI_SCHEMA_VALIDATION_FAILED',
  'AI_EVIDENCE_VALIDATION_FAILED',
  'SOURCE_UNDERSTANDING_EVIDENCE_INVALID',
  'SOURCE_UNDERSTANDING_STRUCTURE_INVALID',
]);

const evidenceErrorCodes = new Set([
  'AI_EVIDENCE_VALIDATION_FAILED',
  'SOURCE_UNDERSTANDING_EVIDENCE_INVALID',
]);

function canFallBackAfter(error) {
  if (fallbackErrorCodes.has(error?.code)) return true;
  const status = error?.status;
  return typeof status === 'number' && status >= 500;
}

function validationResultOf(error) {
  if (!validationErrorCodes.has(error?.code)) return null;
  return evidenceErrorCodes.has(error.code) ? 'evidence_invalid' : 'schema_invalid';
}

function fallbackReasonOf(error) {
  if (error?.code === 'AI_FREE_QUOTA_EXHAUSTED') return 'quota_exhausted';
  if (error?.code === 'AI_PROVIDER_TIMEOUT') return 'timeout';
  return validationResultOf(error) ?? 'retries_exhausted';
}

function isAvailabilityFailure(error) {
  return !validationErrorCodes.has(error?.code) && canFallBackAfter(error);
}

/**
 * Privacy gate (RFC 0001 section 5.2). Personal data may only reach approved paid endpoints.
 * Applied once, before the first attempt; retries and fallbacks only use the filtered list.
 */
export function filterChainForDataClass(entries, dataClass) {
  if (dataClass === DATA_CLASSES.GENERAL) return entries;
  return entries.filter((entry) => entry.endpointClass === 'paid_approved');
}

/**
 * Operation policy (plan 0002 section 4, change 4). Generation never runs on a free endpoint, and
 * preparation never runs on a model of the generation chain, so the generation model is never
 * chosen by preparation logic.
 */
export function applyOperationPolicy(entries, { profile, generationChain = [] }) {
  if (profile === 'core') return entries.filter((entry) => entry.endpointClass !== 'free');
  if (profile !== 'fast') return entries;
  const generationModels = new Set(
    generationChain.map(({ provider, model }) => `${provider}:${model}`),
  );
  return entries.filter(({ provider, model }) => !generationModels.has(`${provider}:${model}`));
}

/**
 * Eligibility gate (RFC 0001 section 5.1). In production unapproved entries are removed; elsewhere
 * they stay but are labelled so every usage record shows it. The grandfathered legacy baseline
 * applies only to the generation profile that the legacy pipeline uses.
 */
export function applyEligibility(entries, { operation, records, adapterOf, production, profile }) {
  const labelled = entries.map((entry) => {
    const eligibility = eligibilityOf(entry, { operation, adapter: adapterOf(entry), records });
    return Object.freeze({
      ...entry,
      eligibility:
        eligibility === 'legacy_baseline' && profile && profile !== 'core'
          ? 'unapproved'
          : eligibility,
    });
  });
  return production ? labelled.filter((entry) => entry.eligibility !== 'unapproved') : labelled;
}

function attemptRecord(entry, chainIndex, { result = null, error = null, fallbackReason = null }) {
  const attempt = (result ?? error?.aiAttempt)?.attempt ?? 1;
  return Object.freeze({
    provider: entry.provider,
    model: entry.model,
    chainIndex,
    eligibility: entry.eligibility ?? null,
    attemptKind: chainIndex > 0 ? 'fallback' : attempt > 1 ? 'retry' : 'initial',
    fallbackReason,
    validationResult: error ? validationResultOf(error) : 'passed',
    result,
    error,
  });
}

function cancelledError() {
  return new AppError('The request was cancelled before the AI call finished', {
    status: 499,
    code: 'AI_REQUEST_CANCELLED',
  });
}

function freeUnavailableError(retryAt) {
  return new AppError('Free AI preparation is temporarily unavailable', {
    status: 503,
    code: 'AI_FREE_PREPARATION_UNAVAILABLE',
    details: retryAt ? { retryAt: new Date(retryAt).toISOString() } : {},
  });
}

function paidLimitError() {
  return new AppError('The paid preparation attempt limit for this request was reached', {
    status: 502,
    code: 'AI_PAID_PREPARATION_LIMIT',
  });
}

function attemptSignal(signal, timeoutMs) {
  const signals = [signal, timeoutMs ? AbortSignal.timeout(timeoutMs) : null].filter(Boolean);
  if (signals.length === 0) return undefined;
  return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}

function usedAttempts(result, error) {
  return (result ?? error?.aiAttempt)?.attempt ?? 1;
}

/**
 * A provider-shaped object that runs one structured operation across an ordered model chain.
 * The operation, prompt, input and schema never change between entries. An optional
 * `validate(data)` lets a schema or evidence failure fall back to the next entry.
 *
 * `budget` (preparation only) bounds free attempts by a shared wall-clock budget and a per-attempt
 * timeout, and paid entries by their own budget. `paidAttemptLimit` caps paid requests, retries
 * included. `freeUnavailablePolicy: 'reject'` stops before any paid entry once the free daily
 * quota is exhausted.
 */
export function createModelChain({
  entries,
  providerFor,
  maxRetries,
  reasoningEffort,
  log,
  budget = null,
  paidAttemptLimit = null,
  freeUnavailablePolicy = 'continue',
  breaker = defaultCircuitBreaker,
  quota = defaultFreeQuotaTracker,
  now = Date.now,
}) {
  if (entries.length === 0) {
    throw new AppError('No AI model is available for this request', {
      status: 503,
      code: 'AI_NO_ELIGIBLE_MODEL',
    });
  }
  const hasFreeEntries = entries.some((entry) => entry.endpointClass === 'free');

  return defineAiProvider({
    name: 'model-chain',
    entries,

    async healthCheck() {
      return Object.freeze({
        provider: 'model-chain',
        models: entries.map((entry) => entry.model),
      });
    },

    async generateStructured({ validate, signal, ...request }) {
      const attempts = [];
      let lastError = null;
      let pendingReason = null;
      let freeStartedAt = null;
      let paidStartedAt = null;
      let paidUsed = 0;
      const fail = (error) => {
        if (error instanceof Error) error.aiAttempts = Object.freeze([...attempts]);
        throw error;
      };

      for (const [chainIndex, entry] of entries.entries()) {
        if (signal?.aborted) fail(cancelledError());
        const isFree = entry.endpointClass === 'free';
        const quotaResetAt = quota.exhaustedUntil();

        if (isFree && quotaResetAt !== null) {
          pendingReason = 'quota_exhausted';
          continue;
        }
        if (
          !isFree &&
          hasFreeEntries &&
          quotaResetAt !== null &&
          freeUnavailablePolicy === 'reject'
        ) {
          fail(freeUnavailableError(quotaResetAt));
        }
        if (breaker.isOpen(entry)) {
          pendingReason = 'circuit_open';
          continue;
        }

        let timeoutMs = null;
        let entryRetries = maxRetries;
        if (budget && isFree) {
          freeStartedAt ??= now();
          const remaining = budget.freeBudgetMs - (now() - freeStartedAt);
          if (remaining <= 0) {
            pendingReason = 'timeout';
            continue;
          }
          timeoutMs = Math.min(budget.freeAttemptTimeoutMs, remaining);
        } else if (budget) {
          paidStartedAt ??= now();
          timeoutMs = budget.paidBudgetMs - (now() - paidStartedAt);
          if (timeoutMs <= 0) fail(lastError ?? paidLimitError());
        }
        if (!isFree && paidAttemptLimit !== null) {
          const paidEntriesLeft = entries
            .slice(chainIndex)
            .filter((candidate) => candidate.endpointClass !== 'free').length;
          const remaining = paidAttemptLimit - paidUsed;
          if (remaining <= 0) fail(lastError ?? paidLimitError());
          entryRetries = Math.min(maxRetries ?? 0, Math.max(0, remaining - paidEntriesLeft));
        }

        let result = null;
        try {
          result = await providerFor(entry).generateStructured({
            ...request,
            model: entry.model,
            ...(reasoningEffort ? { reasoningEffort } : {}),
            ...(entryRetries === undefined ? {} : { maxRetries: entryRetries }),
            signal: attemptSignal(signal, timeoutMs),
            deadline: timeoutMs ? now() + timeoutMs : null,
          });
          if (!isFree) paidUsed += usedAttempts(result);
          validate?.(result.data);
          breaker.recordSuccess(entry);
          const record = attemptRecord(entry, chainIndex, {
            result,
            fallbackReason: pendingReason,
          });
          attempts.push(record);
          return Object.freeze({
            ...result,
            attemptKind: record.attemptKind,
            chainIndex,
            eligibility: entry.eligibility ?? null,
            attempts: Object.freeze([...attempts]),
          });
        } catch (caught) {
          const error = signal?.aborted ? cancelledError() : caught;
          if (error !== caught && caught?.aiAttempt) error.aiAttempt = caught.aiAttempt;
          if (!isFree && !result) paidUsed += usedAttempts(null, error);
          attempts.push(
            attemptRecord(entry, chainIndex, { result, error, fallbackReason: pendingReason }),
          );
          if (error.code === 'AI_REQUEST_CANCELLED') fail(error);
          if (error.code === 'AI_FREE_QUOTA_EXHAUSTED') quota.markExhausted(error.details?.retryAt);
          if (isAvailabilityFailure(error)) breaker.recordFailure(entry);
          lastError = error;
          const fallBack = canFallBackAfter(error) || validationErrorCodes.has(error?.code);
          if (!fallBack || chainIndex === entries.length - 1) fail(error);
          pendingReason = fallbackReasonOf(error);
          log?.warn(
            { errorCode: error?.code, from: entry.model, reason: pendingReason },
            'AI model chain falling back',
          );
        }
      }

      const quotaResetAt = quota.exhaustedUntil();
      if (quotaResetAt !== null && hasFreeEntries) fail(freeUnavailableError(quotaResetAt));
      fail(
        lastError ??
          new AppError('No AI model is available for this request', {
            status: 503,
            code: 'AI_NO_ELIGIBLE_MODEL',
          }),
      );
      return null;
    },
  });
}
