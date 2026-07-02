import { aiConfig, requireAiConfiguration } from '../ai.config.js';
import { aiProviderRegistry } from './ai-provider.registry.js';
import { createOpenAiProvider } from './openai.provider.js';

let initialized = false;

function initializeProviders() {
  if (initialized) return;

  if (aiConfig.provider === 'openai') {
    aiProviderRegistry.register(
      createOpenAiProvider({
        apiKey: aiConfig.apiKey,
        timeout: aiConfig.requestTimeoutMs,
      }),
    );
  }

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
