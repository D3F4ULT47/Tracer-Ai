import { env } from '../../config/env.js';
import { resourceAdapterRegistry } from '../../resources/adapter-registry/resource-adapter-registry.js';
import { createGitHubProvider } from './providers/github.provider.js';
import { createOfficialDocsProvider } from './providers/official-docs.provider.js';
import { createYouTubeProvider } from './providers/youtube.provider.js';

export function registerResourceProviders({
  registry = resourceAdapterRegistry,
  fetcher = fetch,
  config = env,
} = {}) {
  const providers = [
    createYouTubeProvider({
      apiKey: config.YOUTUBE_API_KEY,
      fetcher,
      timeoutMs: config.RESOURCE_DISCOVERY_TIMEOUT_MS,
    }),
    createGitHubProvider({
      token: config.GITHUB_TOKEN,
      fetcher,
      timeoutMs: config.RESOURCE_DISCOVERY_TIMEOUT_MS,
    }),
    createOfficialDocsProvider(),
  ];
  for (const provider of providers) {
    if (!registry.get(provider.name)) registry.register(provider);
  }
  return registry;
}
