import { env } from '../../config/env.js';
import { AppError } from '../../shared/app-error.js';

export const knownAiProviders = Object.freeze([
  'aicredits',
  'aicredits-chat',
  'openrouter',
  'openai',
]);

/**
 * Parses `provider:model[,provider:model…]`. Model IDs may themselves contain `:` (for example
 * `:free`), so only a known provider name before the first `:` is treated as a prefix.
 */
export function parseModelChain(specification, defaultProvider) {
  if (!specification) return Object.freeze([]);
  return Object.freeze(
    specification
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf(':');
        const prefix = separator > 0 ? entry.slice(0, separator) : null;
        const provider = knownAiProviders.includes(prefix) ? prefix : defaultProvider;
        const model = provider === prefix ? entry.slice(separator + 1) : entry;
        return Object.freeze({
          provider,
          model,
          endpointClass: provider === 'openrouter' ? 'free' : 'paid_approved',
        });
      }),
  );
}

const modelProfiles = Object.freeze({
  fast: env.AI_MODEL_FAST,
  core: env.AI_MODEL_CORE,
  escalation: env.AI_MODEL_ESCALATION,
});

const profileSettings = Object.freeze({
  fast: { maxRetries: env.AI_MAX_RETRIES_FAST, reasoningEffort: env.AI_REASONING_EFFORT_FAST },
  core: { maxRetries: env.AI_MAX_RETRIES_CORE, reasoningEffort: env.AI_REASONING_EFFORT_CORE },
  escalation: {},
});

export const aiConfig = Object.freeze({
  provider: env.AI_PROVIDER,
  apiKey: env.AI_API_KEY,
  baseURL: env.AI_BASE_URL,
  openRouterApiKey: env.OPENROUTER_API_KEY,
  openRouterBaseURL: env.OPENROUTER_BASE_URL,
  requestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
  maxRetries: env.AI_MAX_RETRIES,
  assessmentConfidenceThreshold: env.AI_ASSESSMENT_CONFIDENCE_THRESHOLD,
  assessmentMaxOutputTokens: env.AI_ASSESSMENT_MAX_OUTPUT_TOKENS,
  sourceUnderstandingMaxOutputTokens: env.AI_SOURCE_UNDERSTANDING_MAX_OUTPUT_TOKENS,
  roadmapMaxOutputTokens: env.AI_ROADMAP_MAX_OUTPUT_TOKENS,
  modelProfiles,
  modelChains: Object.freeze(
    Object.fromEntries(
      Object.entries(modelProfiles).map(([profile, specification]) => [
        profile,
        parseModelChain(specification, env.AI_PROVIDER),
      ]),
    ),
  ),
  profileSettings,
  preparation: Object.freeze({
    freeBudgetMs: env.AI_FREE_PREPARATION_BUDGET_MS,
    freeAttemptTimeoutMs: env.AI_FREE_ATTEMPT_TIMEOUT_MS,
    paidBudgetMs: env.AI_PAID_FALLBACK_BUDGET_MS,
    paidAttemptLimit: env.AI_PAID_PREPARATION_LIMIT,
    freeUnavailablePolicy: env.AI_FREE_UNAVAILABLE_POLICY,
    failurePolicy: env.AI_PREPARATION_FAILURE_POLICY,
    evidenceRepairTimeoutMs: env.AI_EVIDENCE_REPAIR_TIMEOUT_MS,
  }),
  reuse: Object.freeze({
    idempotencyEnabled: env.AI_IDEMPOTENCY_ENABLED,
    idempotencyTtlSeconds: env.AI_IDEMPOTENCY_TTL_SECONDS,
    idempotencyWaitMs: env.AI_IDEMPOTENCY_WAIT_MS,
    dedupEnabled: env.AI_DEDUP_ENABLED,
    resultCacheEnabled: env.AI_RESULT_CACHE_ENABLED,
    publicTtlSeconds: env.AI_CACHE_PUBLIC_TTL_SECONDS,
    ownerTtlSeconds: env.AI_CACHE_OWNER_TTL_SECONDS,
  }),
  isProduction: env.NODE_ENV === 'production',
});

export function requireAiConfiguration(profile = 'core') {
  const chain = aiConfig.modelChains[profile] ?? [];

  if (!aiConfig.apiKey || !aiConfig.baseURL || chain.length === 0) {
    throw new AppError('AI generation is not configured', {
      status: 503,
      code: 'AI_NOT_CONFIGURED',
    });
  }

  return Object.freeze({
    provider: chain[0].provider,
    apiKey: aiConfig.apiKey,
    baseURL: aiConfig.baseURL,
    model: chain[0].model,
    chain,
    profile,
    requestTimeoutMs: aiConfig.requestTimeoutMs,
    maxRetries: profileSettings[profile]?.maxRetries ?? aiConfig.maxRetries,
    reasoningEffort: profileSettings[profile]?.reasoningEffort ?? null,
  });
}
