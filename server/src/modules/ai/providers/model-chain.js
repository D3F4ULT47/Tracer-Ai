import { AppError } from '../../../shared/app-error.js';
import { defineAiProvider } from './ai-provider.js';
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
]);

const validationErrorCodes = new Set([
  'AI_SCHEMA_VALIDATION_FAILED',
  'AI_EVIDENCE_VALIDATION_FAILED',
  'SOURCE_UNDERSTANDING_EVIDENCE_INVALID',
  'SOURCE_UNDERSTANDING_STRUCTURE_INVALID',
]);

function canFallBackAfter(error) {
  if (fallbackErrorCodes.has(error?.code)) return true;
  const status = error?.status;
  return typeof status === 'number' && status >= 500;
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
 * Eligibility gate (RFC 0001 section 5.1). In production unapproved entries are removed; elsewhere
 * they stay but are labelled so every usage record shows it.
 */
export function applyEligibility(entries, { operation, records, adapterOf, production }) {
  const labelled = entries.map((entry) =>
    Object.freeze({
      ...entry,
      eligibility: eligibilityOf(entry, { operation, adapter: adapterOf(entry), records }),
    }),
  );
  return production ? labelled.filter((entry) => entry.eligibility !== 'unapproved') : labelled;
}

function attemptRecord(entry, chainIndex, { result = null, error = null }) {
  const attempt = (result ?? error?.aiAttempt)?.attempt ?? 1;
  return Object.freeze({
    provider: entry.provider,
    model: entry.model,
    chainIndex,
    eligibility: entry.eligibility ?? null,
    attemptKind: chainIndex > 0 ? 'fallback' : attempt > 1 ? 'retry' : 'initial',
    result,
    error,
  });
}

/**
 * A provider-shaped object that runs one structured operation across an ordered model chain.
 * The operation, prompt, input and schema never change between entries. An optional
 * `validate(data)` lets one schema or evidence failure fall back to the next entry.
 */
export function createModelChain({ entries, providerFor, maxRetries, reasoningEffort, log }) {
  if (entries.length === 0) {
    throw new AppError('No AI model is available for this request', {
      status: 503,
      code: 'AI_NO_ELIGIBLE_MODEL',
    });
  }

  return defineAiProvider({
    name: 'model-chain',
    entries,

    async healthCheck() {
      return Object.freeze({
        provider: 'model-chain',
        models: entries.map((entry) => entry.model),
      });
    },

    async generateStructured({ validate, ...request }) {
      const attempts = [];
      let validationFallbackUsed = false;

      for (const [chainIndex, entry] of entries.entries()) {
        let result = null;
        try {
          result = await providerFor(entry).generateStructured({
            ...request,
            model: entry.model,
            ...(reasoningEffort ? { reasoningEffort } : {}),
            ...(maxRetries === undefined ? {} : { maxRetries }),
          });
          validate?.(result.data);
          const record = attemptRecord(entry, chainIndex, { result });
          attempts.push(record);
          return Object.freeze({
            ...result,
            attemptKind: record.attemptKind,
            chainIndex,
            eligibility: entry.eligibility ?? null,
            attempts: Object.freeze([...attempts]),
          });
        } catch (error) {
          attempts.push(attemptRecord(entry, chainIndex, { result, error }));
          const isValidation = validationErrorCodes.has(error?.code);
          const hasNext = chainIndex < entries.length - 1;
          const fallBack =
            hasNext && (canFallBackAfter(error) || (isValidation && !validationFallbackUsed));
          if (isValidation) validationFallbackUsed = true;
          if (!fallBack) {
            if (error instanceof Error) error.aiAttempts = Object.freeze([...attempts]);
            throw error;
          }
          log?.warn(
            { errorCode: error?.code, from: entry.model, to: entries[chainIndex + 1].model },
            'AI model chain falling back',
          );
        }
      }
      throw new Error('unreachable');
    },
  });
}
