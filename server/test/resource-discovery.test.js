import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { ResourceAdapterRegistry } from '../src/resources/adapter-registry/resource-adapter-registry.js';
import { Resource } from '../src/modules/resources/models/resource.model.js';
import { ProviderRateLimiter } from '../src/modules/resources/provider-rate-limiter.js';
import { createGitHubProvider } from '../src/modules/resources/providers/github.provider.js';
import { createOfficialDocsProvider } from '../src/modules/resources/providers/official-docs.provider.js';
import { resourceCandidate } from '../src/modules/resources/providers/resource-candidate.js';
import { createYouTubeProvider } from '../src/modules/resources/providers/youtube.provider.js';
import { createResourceDiscoveryService } from '../src/modules/resources/resource-discovery.service.js';
import { createResourceRepository } from '../src/modules/resources/resource.repository.js';
import { hashResourceUrl } from '../src/modules/resources/resource-url.js';
import { validateResourceCandidate } from '../src/modules/resources/resource.validator.js';

function response(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return data;
    },
  };
}

function candidate(overrides = {}) {
  return resourceCandidate({
    provider: 'official_docs',
    providerResourceId: 'react-docs',
    type: 'documentation',
    canonicalUrl: 'https://react.dev/',
    title: 'React Documentation',
    description: 'Official React documentation.',
    author: 'React Team',
    language: 'English',
    difficulty: 'intermediate',
    tags: ['react'],
    providerMetadata: { curated: true },
    ...overrides,
  });
}

function persisted(candidateValue) {
  const now = new Date();
  return {
    ...candidateValue,
    resourceId: randomUUID(),
    canonicalUrlHash: hashResourceUrl(candidateValue.canonicalUrl),
    createdAt: now,
    updatedAt: now,
    retrievedAt: new Date(candidateValue.retrievedAt),
  };
}

const discoveryInput = {
  task: {
    title: 'Learn React Hooks',
    description: 'Understand state and effect hooks.',
    difficulty: 'intermediate',
  },
  learningContext: {
    technologyStack: { value: ['React', 'JavaScript'] },
    preferredResourceLanguage: { value: 'English' },
  },
};

test('resource registry exposes searchable providers without breaking URL adapters', () => {
  const registry = new ResourceAdapterRegistry();
  registry.register({
    name: 'search-provider',
    search: async () => [],
    normalize: (value) => value,
  });
  registry.register({
    name: 'url-adapter',
    canHandle: (value) => value === 'supported',
    normalize: (value) => value,
  });

  assert.equal(registry.get('search-provider').name, 'search-provider');
  assert.deepEqual(
    registry.searchable().map((provider) => provider.name),
    ['search-provider'],
  );
  assert.equal(registry.find('supported').name, 'url-adapter');
});

test('normalized resource candidates validate against the shared contract', () => {
  assert.equal(validateResourceCandidate(candidate()).provider, 'official_docs');
  assert.throws(
    () => validateResourceCandidate({ ...candidate(), canonicalUrl: 'not-a-url' }),
    (error) => error.code === 'RESOURCE_CANDIDATE_INVALID',
  );
});

test('official documentation discovery uses only the curated registry', async () => {
  const provider = createOfficialDocsProvider();
  const raw = await provider.search({ query: 'Learn React hooks' }, { limit: 10 });
  const normalized = raw.map((item) => provider.normalize(item, discoveryInput));

  assert.ok(normalized.some((item) => item.canonicalUrl === 'https://react.dev/'));
  assert.ok(normalized.every((item) => item.providerMetadata.curated === true));
  assert.ok(normalized.every((item) => item.provider === 'official_docs'));
});

test('GitHub provider uses the public REST API and normalizes repository metadata', async () => {
  let request;
  const provider = createGitHubProvider({
    token: 'optional-token',
    fetcher: async (url, options) => {
      request = { url: String(url), options };
      return response({
        items: [
          {
            id: 123,
            html_url: 'https://github.com/example/react-hooks',
            full_name: 'example/react-hooks',
            description: 'Practice repository',
            owner: { login: 'example', avatar_url: 'https://avatars.githubusercontent.com/u/1' },
            language: 'JavaScript',
            topics: ['react', 'hooks'],
            stargazers_count: 150,
            forks_count: 20,
            open_issues_count: 2,
            archived: false,
          },
        ],
      });
    },
  });
  const [raw] = await provider.search({ query: 'React hooks' }, { limit: 5 });
  const normalized = provider.normalize(raw, discoveryInput);

  assert.match(request.url, /^https:\/\/api\.github\.com\/search\/repositories/);
  assert.equal(request.options.headers.Authorization, 'Bearer optional-token');
  assert.equal(normalized.popularity.stars, 150);
  assert.equal(normalized.type, 'repository');
});

test('YouTube provider remains disabled without a key and normalizes API results with a key', async () => {
  assert.equal(createYouTubeProvider().isEnabled(), false);
  const provider = createYouTubeProvider({
    apiKey: 'youtube-key',
    fetcher: async (url) => {
      if (new URL(url).pathname.endsWith('/search')) {
        return response({
          items: [
            {
              id: { videoId: 'video-1' },
              snippet: {
                title: 'React Hooks Tutorial',
                description: 'Learn hooks',
                channelTitle: 'Example Creator',
                channelId: 'channel-1',
                thumbnails: { high: { url: 'https://img.youtube.com/video-1.jpg' } },
              },
            },
          ],
        });
      }
      return response({
        items: [
          {
            id: 'video-1',
            contentDetails: { duration: 'PT12M30S' },
            statistics: { viewCount: '5000', likeCount: '200' },
          },
        ],
      });
    },
  });
  const [raw] = await provider.search({ query: 'React hooks' }, { limit: 5 });
  const normalized = provider.normalize(raw, discoveryInput);

  assert.equal(normalized.canonicalUrl, 'https://www.youtube.com/watch?v=video-1');
  assert.equal(normalized.estimatedDurationMinutes, 13);
  assert.equal(normalized.popularity.views, 5000);
});

test('discovery isolates failed providers, validates candidates, deduplicates, and persists once', async () => {
  const registry = new ResourceAdapterRegistry();
  registry.register({
    name: 'working',
    search: async () => [{ id: 1 }, { id: 2 }],
    normalize: () => candidate(),
    isEnabled: () => true,
    rateLimit: { maximum: 10, windowMs: 60_000 },
  });
  registry.register({
    name: 'failing',
    search: async () => {
      throw new Error('provider unavailable');
    },
    normalize: (item) => item,
    isEnabled: () => true,
    rateLimit: { maximum: 10, windowMs: 60_000 },
  });
  let persistedCandidates;
  const repository = {
    async upsertMany(values) {
      persistedCandidates = values;
      return values.map(persisted);
    },
  };
  const service = createResourceDiscoveryService({
    registry,
    repository,
    maximumPerProvider: 10,
    log: { warn() {} },
  });
  const result = await service.discover(discoveryInput);

  assert.equal(persistedCandidates.length, 1);
  assert.equal(result.resources.length, 1);
  assert.equal(result.diagnostics.discovered, 2);
  assert.equal(result.diagnostics.deduplicated, 1);
  assert.equal(result.diagnostics.partial, true);
  assert.equal(
    result.diagnostics.providers.find((entry) => entry.provider === 'failing').status,
    'failed',
  );
});

test('provider limiter rejects requests beyond the configured window', () => {
  let now = 1_000;
  const limiter = new ProviderRateLimiter({ clock: () => now });
  limiter.consume('github', { maximum: 1, windowMs: 60_000 });
  assert.throws(
    () => limiter.consume('github', { maximum: 1, windowMs: 60_000 }),
    (error) => error.code === 'RESOURCE_PROVIDER_RATE_LIMITED',
  );
  now += 60_001;
  assert.doesNotThrow(() => limiter.consume('github', { maximum: 1, windowMs: 60_000 }));
});

test('resource repository canonicalizes URLs and deduplicates persistence operations', async () => {
  let operations;
  let stored = [];
  const model = {
    async bulkWrite(nextOperations) {
      operations = nextOperations;
      stored = nextOperations.map(({ updateOne }) => ({
        ...updateOne.update.$setOnInsert,
        ...updateOne.update.$set,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
    },
    find() {
      return { lean: async () => stored };
    },
  };
  const repository = createResourceRepository({ model });
  const values = await repository.upsertMany([
    candidate({ canonicalUrl: 'https://react.dev/?utm_source=test' }),
    candidate({ canonicalUrl: 'https://react.dev/' }),
  ]);

  assert.equal(operations.length, 1);
  assert.equal(values.length, 1);
  assert.equal(values[0].canonicalUrl, 'https://react.dev/');
});

test('resource persistence is reusable and contains no roadmap or task ownership', () => {
  assert.equal(Resource.collection.name, 'resources');
  assert.equal(Resource.schema.path('roadmapId'), undefined);
  assert.equal(Resource.schema.path('taskId'), undefined);
  const indexes = Resource.schema.indexes();
  assert.ok(indexes.some(([fields, options]) => fields.canonicalUrlHash === 1 && options.unique));
  assert.ok(
    indexes.some(
      ([fields, options]) =>
        fields.provider === 1 && fields.providerResourceId === 1 && options.unique,
    ),
  );
});
