import { env } from '../../config/env.js';
import { logger } from '../../infrastructure/logging/logger.js';
import { resourceAdapterRegistry } from '../../resources/adapter-registry/resource-adapter-registry.js';
import { buildDiscoveryQuery, validateDiscoveryInput } from './resource-discovery.input.js';
import { ProviderRateLimiter } from './provider-rate-limiter.js';
import { presentResource } from './resource.presenter.js';
import { resourceRepository } from './resource.repository.js';
import { canonicalizeResourceUrl, hashResourceUrl } from './resource-url.js';
import { validateResourceCandidate } from './resource.validator.js';

function errorCode(error) {
  return error?.code ?? 'RESOURCE_PROVIDER_ERROR';
}

function normalizeCandidate(candidate) {
  const canonicalUrl = canonicalizeResourceUrl(candidate.canonicalUrl);
  return validateResourceCandidate({ ...candidate, canonicalUrl });
}

export function createResourceDiscoveryService({
  registry = resourceAdapterRegistry,
  repository = resourceRepository,
  limiter = new ProviderRateLimiter(),
  maximumPerProvider = env.RESOURCE_DISCOVERY_MAX_RESULTS_PER_PROVIDER,
  log = logger,
} = {}) {
  return Object.freeze({
    async discover(input, { signal } = {}) {
      const validated = validateDiscoveryInput(input);
      const context = buildDiscoveryQuery(validated);
      const providers = registry.searchable();
      const diagnostics = [];
      const settled = await Promise.all(
        providers.map(async (provider) => {
          if (provider.isEnabled && !provider.isEnabled()) {
            diagnostics.push({
              provider: provider.name,
              status: 'disabled',
              discovered: 0,
              rejected: 0,
              errorCode: null,
            });
            return [];
          }
          try {
            limiter.consume(provider.name, provider.rateLimit ?? { maximum: 60, windowMs: 60_000 });
            const raw = await provider.search(context, {
              limit: maximumPerProvider,
              signal,
            });
            if (!Array.isArray(raw)) throw new TypeError('Provider search must return an array');
            const candidates = [];
            let rejected = 0;
            for (const item of raw) {
              try {
                candidates.push(normalizeCandidate(await provider.normalize(item, context)));
              } catch (error) {
                rejected += 1;
                log.warn(
                  { provider: provider.name, errorCode: errorCode(error) },
                  'Resource provider candidate rejected',
                );
              }
            }
            diagnostics.push({
              provider: provider.name,
              status: rejected > 0 ? 'partial' : 'succeeded',
              discovered: candidates.length,
              rejected,
              errorCode: null,
            });
            return candidates;
          } catch (error) {
            log.warn(
              { provider: provider.name, errorCode: errorCode(error) },
              'Resource discovery provider failed',
            );
            diagnostics.push({
              provider: provider.name,
              status: 'failed',
              discovered: 0,
              rejected: 0,
              errorCode: errorCode(error),
            });
            return [];
          }
        }),
      );
      const unique = new Map();
      for (const candidate of settled.flat()) {
        const hash = hashResourceUrl(candidate.canonicalUrl);
        if (!unique.has(hash)) unique.set(hash, candidate);
      }
      const persisted = await repository.upsertMany([...unique.values()]);
      return {
        resources: persisted.map(presentResource),
        diagnostics: {
          partial: diagnostics.some((entry) =>
            ['disabled', 'failed', 'partial'].includes(entry.status),
          ),
          providers: diagnostics.sort((left, right) => left.provider.localeCompare(right.provider)),
          discovered: settled.flat().length,
          deduplicated: unique.size,
          persisted: persisted.length,
        },
      };
    },
  });
}
