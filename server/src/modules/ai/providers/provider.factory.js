import { aiConfig, requireAiConfiguration } from '../ai.config.js';
import { aiProviderRegistry } from './ai-provider.registry.js';
import { createOpenAiCompatibleProvider } from './openai-compatible.provider.js';

let initialized = false;

function initializeProviders() {
  if (initialized) return;

  aiProviderRegistry.register(
    createOpenAiCompatibleProvider({
      providerName: aiConfig.provider,
      apiKey: aiConfig.apiKey,
      baseURL: aiConfig.baseURL,
      timeout: aiConfig.requestTimeoutMs,
      maxRetries: aiConfig.maxRetries,
    }),
  );

  initialized = true;
}

export function getConfiguredAiProvider(profile = 'core') {
  const configuration = requireAiConfiguration(profile);
  initializeProviders();

  return Object.freeze({
    provider: aiProviderRegistry.get(configuration.provider),
    configuration,
  });
}
