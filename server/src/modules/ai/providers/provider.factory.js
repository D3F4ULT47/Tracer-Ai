import { logger } from '../../../infrastructure/logging/logger.js';
import { aiConfig, requireAiConfiguration } from '../ai.config.js';
import { aiProviderRegistry } from './ai-provider.registry.js';
import { createChatCompletionsProvider } from './chat-completions.provider.js';
import {
  DATA_CLASSES,
  applyEligibility,
  createModelChain,
  filterChainForDataClass,
} from './model-chain.js';
import { loadModelEligibility } from './model-eligibility.js';
import { createOpenAiCompatibleProvider } from './openai-compatible.provider.js';
import { aiReuseLayer } from '../reuse/reusable-provider.js';

let initialized = false;
let eligibilityRecords;

function initializeProviders() {
  if (initialized) return;
  const shared = {
    apiKey: aiConfig.apiKey,
    baseURL: aiConfig.baseURL,
    timeout: aiConfig.requestTimeoutMs,
    maxRetries: aiConfig.maxRetries,
  };

  aiProviderRegistry.register(
    createOpenAiCompatibleProvider({ providerName: aiConfig.provider, ...shared }),
  );
  if (aiConfig.provider === 'aicredits') {
    aiProviderRegistry.register(
      createChatCompletionsProvider({ providerName: 'aicredits-chat', ...shared }),
    );
  }
  if (aiConfig.openRouterApiKey) {
    aiProviderRegistry.register(
      createChatCompletionsProvider({
        providerName: 'openrouter',
        apiKey: aiConfig.openRouterApiKey,
        baseURL: aiConfig.openRouterBaseURL,
        timeout: aiConfig.requestTimeoutMs,
        maxRetries: aiConfig.maxRetries,
        endpointClass: 'free',
      }),
    );
  }

  initialized = true;
}

/**
 * Time budgets, the paid attempt cap and the free-quota policy apply to preparation only
 * (Plan 0002 D-2, D-7, D-8); generation keeps its single-model retry behaviour.
 */
export function chainLimits(profile, preparation = aiConfig.preparation) {
  if (profile !== 'fast') return {};
  return {
    budget: {
      freeBudgetMs: preparation.freeBudgetMs,
      freeAttemptTimeoutMs: preparation.freeAttemptTimeoutMs,
      paidBudgetMs: preparation.paidBudgetMs,
    },
    paidAttemptLimit: preparation.paidAttemptLimit,
    freeUnavailablePolicy: preparation.freeUnavailablePolicy,
  };
}

function registeredEntries(chain) {
  const registered = new Set(aiProviderRegistry.list());
  return chain.filter((entry) => registered.has(entry.provider));
}

/**
 * Resolves a profile to a gated model chain. `dataClass` defaults to personal so an unclassified
 * request can never reach a free endpoint. `reuse.scope` enables result caching and in-flight
 * deduplication for that learner (or `public`); without a scope every call goes to the provider.
 */
export function getConfiguredAiProvider(
  profile = 'core',
  { operation = 'roadmap_generation', dataClass = DATA_CLASSES.PERSONAL, reuse = null } = {},
) {
  const configuration = requireAiConfiguration(profile);
  initializeProviders();
  eligibilityRecords ??= loadModelEligibility();

  const privacyFiltered = filterChainForDataClass(
    registeredEntries(configuration.chain),
    dataClass,
  );
  const entries = applyEligibility(privacyFiltered, {
    operation,
    records: eligibilityRecords,
    adapterOf: (entry) => aiProviderRegistry.get(entry.provider).api,
    production: aiConfig.isProduction,
  });
  const chain = createModelChain({
    entries,
    providerFor: (entry) => aiProviderRegistry.get(entry.provider),
    maxRetries: configuration.maxRetries,
    reasoningEffort: configuration.reasoningEffort,
    log: logger,
    ...chainLimits(profile),
  });
  const provider = reuse?.scope
    ? aiReuseLayer.wrap(chain, {
        operation,
        scope: reuse.scope,
        dataClass,
        models: entries.map((entry) => `${entry.provider}:${entry.model}`),
        cacheTtlSeconds: reuse.cacheTtlSeconds ?? 0,
      })
    : chain;

  return Object.freeze({
    provider,
    configuration: Object.freeze({
      ...configuration,
      provider: entries[0].provider,
      model: entries[0].model,
      chain: entries,
      dataClass,
      operation,
    }),
  });
}

/**
 * Health-checks every provider that appears in any configured chain, once per provider.
 */
export async function checkConfiguredAiProviders() {
  initializeProviders();
  const modelsByProvider = new Map();
  for (const chain of Object.values(aiConfig.modelChains)) {
    for (const entry of registeredEntries(chain)) {
      const models = modelsByProvider.get(entry.provider) ?? new Set();
      models.add(entry.model);
      modelsByProvider.set(entry.provider, models);
    }
  }

  const coreProviders = new Set(aiConfig.modelChains.core.map((entry) => entry.provider));
  for (const [providerName, models] of modelsByProvider) {
    try {
      await aiProviderRegistry.get(providerName).healthCheck({ models: [...models] });
    } catch (error) {
      if (coreProviders.has(providerName)) throw error;
      logger.warn(
        { provider: providerName, errorCode: error?.code },
        'AI fallback provider health check failed',
      );
    }
  }
}
