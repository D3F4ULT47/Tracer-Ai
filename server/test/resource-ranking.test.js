import assert from 'node:assert/strict';
import test from 'node:test';
import { createResourceRankingService } from '../src/modules/resources/ranking/resource-ranking.service.js';
import { createDefaultScoringRules } from '../src/modules/resources/ranking/scoring-rules.js';
import { ScoringRuleRegistry } from '../src/modules/resources/ranking/scoring-rule.registry.js';
import { hashResourceUrl } from '../src/modules/resources/resource-url.js';

const fixedNow = new Date('2026-07-01T00:00:00.000Z');

function resource(overrides = {}) {
  const canonicalUrl = overrides.canonicalUrl ?? 'https://react.dev/';
  return {
    resourceId: overrides.resourceId ?? '11111111-1111-4111-8111-111111111111',
    provider: 'official_docs',
    providerResourceId: 'react-docs',
    type: 'documentation',
    canonicalUrl,
    title: 'React Documentation',
    description: 'Official React documentation for building user interfaces with components.',
    author: 'React Team',
    language: 'English',
    estimatedDurationMinutes: 45,
    difficulty: 'intermediate',
    tags: ['react', 'frontend', 'components'],
    thumbnailUrl: null,
    popularity: {
      views: null,
      likes: null,
      stars: null,
      forks: null,
      rating: null,
      ratingCount: null,
    },
    retrievedAt: '2026-06-30T00:00:00.000Z',
    providerMetadata: { official: true, curated: true },
    metadataVersion: '1.0.0',
    availabilityStatus: 'available',
    accessType: 'free',
    authorityScore: null,
    freshnessScore: null,
    popularityScore: null,
    completenessScore: null,
    providerConfidenceScore: null,
    qualityScore: null,
    qualityScoringVersion: null,
    createdAt: '2026-06-30T00:00:00.000Z',
    updatedAt: '2026-06-30T00:00:00.000Z',
    ...overrides,
    canonicalUrlHash: hashResourceUrl(canonicalUrl),
  };
}

function context(overrides = {}) {
  return {
    currentProficiency: { value: 'intermediate' },
    difficultyPreference: { value: 'intermediate' },
    weeklyHours: { value: 8 },
    preferredLanguage: { value: 'English' },
    preferredResourceLanguage: { value: 'English' },
    preferredPlatforms: { value: ['Official Documentation'] },
    learningStyle: { value: 'reading' },
    budget: { value: 0 },
    constraints: { value: ['Use only free resources'] },
    primaryGoal: { value: 'Become a frontend engineer' },
    careerGoal: { value: 'Frontend engineering' },
    ...overrides,
  };
}

const task = {
  title: 'Learn React components',
  description: 'Build reusable frontend components.',
  difficulty: 'intermediate',
  estimatedMinutes: 90,
  type: 'learn',
  progressContext: { completedPhaseTitles: ['JavaScript Foundations'], completedTaskCount: 8 },
};

function repository({ fail = false } = {}) {
  const updates = [];
  return {
    updates,
    async updateQualitySignals(values) {
      if (fail) throw new Error('persistence unavailable');
      updates.push(...values);
    },
  };
}

function service(options = {}) {
  return createResourceRankingService({
    now: () => fixedNow,
    log: { warn() {} },
    repository: repository(),
    ...options,
  });
}

test('ranking is deterministic with stable tie-breaking', async () => {
  const input = {
    learningContext: context(),
    task,
    resources: [
      resource({
        resourceId: '22222222-2222-4222-8222-222222222222',
        providerResourceId: 'react-reference',
        canonicalUrl: 'https://react.dev/reference/react',
        title: 'React API Reference',
      }),
      resource(),
    ],
  };
  const first = await service().rank(input);
  const second = await service().rank(input);

  assert.deepEqual(first, second);
  assert.deepEqual(
    first.candidates.map((candidate) => candidate.rank),
    [1, 2],
  );
  assert.equal(first.rankingVersion, '1.0.0');
});

test('ranking stores every score independently and computes bounded totals', async () => {
  const result = await service().rank({
    learningContext: context(),
    task,
    resources: [resource()],
  });
  const [candidate] = result.candidates;

  for (const name of [
    'authorityScore',
    'freshnessScore',
    'popularityScore',
    'difficultyMatch',
    'learningStyleMatch',
    'preferredPlatformMatch',
    'languageMatch',
    'estimatedTimeMatch',
    'completenessScore',
    'providerConfidenceScore',
    'goalMatch',
    'budgetMatch',
    'qualityScore',
  ]) {
    assert.ok(candidate.scores[name] >= 0 && candidate.scores[name] <= 100, name);
  }
  assert.equal(candidate.scores.authorityScore, 100);
  assert.equal(candidate.scores.difficultyMatch, 100);
  assert.equal(candidate.scores.languageMatch, 100);
  assert.equal(candidate.scores.budgetMatch, 100);
  assert.ok(candidate.overallScore >= 0 && candidate.overallScore <= 100);
});

test('preferred language changes ranking for otherwise equivalent resources', async () => {
  const english = resource({
    resourceId: '33333333-3333-4333-8333-333333333333',
    providerResourceId: 'english',
    canonicalUrl: 'https://react.dev/english',
    language: 'English',
  });
  const hindi = resource({
    resourceId: '44444444-4444-4444-8444-444444444444',
    providerResourceId: 'hindi',
    canonicalUrl: 'https://react.dev/hindi',
    language: 'Hindi',
  });
  const englishResult = await service().rank({
    learningContext: context({ preferredResourceLanguage: { value: 'English' } }),
    task,
    resources: [hindi, english],
  });
  const hindiResult = await service().rank({
    learningContext: context({ preferredResourceLanguage: { value: 'Hindi' } }),
    task,
    resources: [english, hindi],
  });

  assert.equal(englishResult.candidates[0].resource.language, 'English');
  assert.equal(hindiResult.candidates[0].resource.language, 'Hindi');
});

test('preferred platform changes ranking without provider-specific orchestration', async () => {
  const youtube = resource({
    resourceId: '55555555-5555-4555-8555-555555555555',
    provider: 'youtube',
    providerResourceId: 'video-1',
    type: 'video',
    canonicalUrl: 'https://www.youtube.com/watch?v=video-1',
    title: 'React Components Video',
    providerMetadata: {},
    popularity: {
      views: 10_000,
      likes: 500,
      stars: null,
      forks: null,
      rating: null,
      ratingCount: null,
    },
  });
  const github = resource({
    resourceId: '66666666-6666-4666-8666-666666666666',
    provider: 'github',
    providerResourceId: 'repo-1',
    type: 'repository',
    canonicalUrl: 'https://github.com/example/react-components',
    title: 'React Components Repository',
    providerMetadata: {},
    popularity: {
      views: null,
      likes: null,
      stars: 500,
      forks: 50,
      rating: null,
      ratingCount: null,
    },
  });

  const youtubeResult = await service().rank({
    learningContext: context({
      preferredPlatforms: { value: ['YouTube'] },
      learningStyle: { value: 'visual' },
    }),
    task,
    resources: [github, youtube],
  });
  const githubResult = await service().rank({
    learningContext: context({
      preferredPlatforms: { value: ['GitHub'] },
      learningStyle: { value: 'project-based' },
    }),
    task,
    resources: [youtube, github],
  });

  assert.equal(youtubeResult.candidates[0].resource.provider, 'youtube');
  assert.equal(githubResult.candidates[0].resource.provider, 'github');
});

test('difficulty and available time influence learner-relative scores', async () => {
  const result = await service().rank({
    learningContext: context({ weeklyHours: { value: 2 } }),
    task: { ...task, difficulty: 'advanced', estimatedMinutes: 60 },
    resources: [
      resource({
        resourceId: '77777777-7777-4777-8777-777777777777',
        providerResourceId: 'advanced-short',
        canonicalUrl: 'https://react.dev/advanced-short',
        difficulty: 'advanced',
        estimatedDurationMinutes: 45,
      }),
      resource({
        resourceId: '88888888-8888-4888-8888-888888888888',
        providerResourceId: 'beginner-long',
        canonicalUrl: 'https://react.dev/beginner-long',
        difficulty: 'beginner',
        estimatedDurationMinutes: 300,
      }),
    ],
  });

  assert.equal(result.candidates[0].resource.difficulty, 'advanced');
  assert.ok(
    result.candidates[0].scores.difficultyMatch > result.candidates[1].scores.difficultyMatch,
  );
  assert.ok(
    result.candidates[0].scores.estimatedTimeMatch > result.candidates[1].scores.estimatedTimeMatch,
  );
});

test('a failed scoring rule degrades only that signal', async () => {
  const registry = new ScoringRuleRegistry();
  for (const rule of createDefaultScoringRules()) {
    registry.register(
      rule.name === 'languageMatch'
        ? {
            ...rule,
            score() {
              throw new Error('signal unavailable');
            },
          }
        : rule,
    );
  }
  const result = await service({ registry }).rank({
    learningContext: context(),
    task,
    resources: [resource()],
  });

  assert.equal(result.candidates[0].scores.languageMatch, 50);
  assert.deepEqual(result.candidates[0].reasoningMetadata.degradedSignals, ['languageMatch']);
});

test('quality persistence stores only reusable intrinsic signals', async () => {
  const qualityRepository = repository();
  await service({ repository: qualityRepository }).rank({
    learningContext: context(),
    task,
    resources: [resource()],
  });
  const [update] = qualityRepository.updates;

  assert.deepEqual(Object.keys(update.signals).sort(), [
    'authorityScore',
    'completenessScore',
    'freshnessScore',
    'popularityScore',
    'providerConfidenceScore',
    'qualityScore',
  ]);
  assert.equal(update.rankingVersion, '1.0.0');
});

test('quality persistence failure does not discard the ranked list', async () => {
  const result = await service({ repository: repository({ fail: true }) }).rank({
    learningContext: context(),
    task,
    resources: [resource()],
  });

  assert.equal(result.candidates.length, 1);
  assert.ok(result.candidates[0].reasoningMetadata.degradedSignals.includes('qualityPersistence'));
});
