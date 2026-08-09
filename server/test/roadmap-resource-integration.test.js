import assert from 'node:assert/strict';
import test from 'node:test';
import { learningExperienceService } from '../src/modules/resources/assignment/learning-experience.service.js';
import { createRoadmapResourceEnrichmentService } from '../src/modules/resources/roadmap-resource-enrichment.service.js';

const timestamp = new Date('2026-07-02T00:00:00.000Z');

function task(key, overrides = {}) {
  return {
    key,
    title: key === 'react' ? 'Learn React' : 'Practice React',
    description: 'Build React knowledge.',
    estimatedMinutes: 90,
    difficulty: 'beginner',
    dependencies: [],
    completionCriteria: ['Build a component.'],
    type: 'learn',
    state: 'NOT_STARTED',
    notes: [],
    resources: [],
    ...overrides,
  };
}

function roadmap() {
  return {
    type: 'skill',
    title: 'React Roadmap',
    phases: [
      {
        key: 'phase-one',
        weeks: [{ key: 'week-one', tasks: [task('react'), task('react-practice')] }],
      },
    ],
  };
}

const ids = {
  video: '11111111-1111-4111-8111-111111111111',
  docs: '22222222-2222-4222-8222-222222222222',
  github: '33333333-3333-4333-8333-333333333333',
  paid: '44444444-4444-4444-8444-444444444444',
};

function resource(resourceId, overrides = {}) {
  return {
    resourceId,
    provider: 'youtube',
    providerResourceId: resourceId,
    type: 'playlist',
    canonicalUrl: `https://www.youtube.com/playlist?list=${resourceId.slice(0, 8)}`,
    title: 'React Tutorial',
    description: 'A beginner React tutorial.',
    author: 'Teacher',
    thumbnailUrl: null,
    accessType: 'free',
    ...overrides,
  };
}

const discovered = [
  resource(ids.video),
  resource(ids.docs, {
    provider: 'official_docs',
    providerResourceId: 'react-docs',
    type: 'documentation',
    canonicalUrl: 'https://react.dev/',
    title: 'React Documentation',
    author: 'React Team',
  }),
  resource(ids.github, {
    provider: 'github',
    providerResourceId: 'example/react',
    type: 'repository',
    canonicalUrl: 'https://github.com/example/react',
    title: 'React Examples',
    author: 'example',
  }),
  resource('55555555-5555-4555-8555-555555555555', {
    provider: 'official_docs',
    providerResourceId: 'react-article',
    type: 'article',
    canonicalUrl: 'https://example.com/react-article',
    title: 'React Article',
    author: 'Writer',
  }),
];

function ranked(resources) {
  return resources.map((item, index) => ({
    rank: index + 1,
    resource: item,
    overallScore: 90 - index * 5,
    rankingVersion: '1.0.0',
  }));
}

function context(mode = 'quick') {
  return {
    mode: { value: mode },
    currentProficiency: { value: mode === 'quick' ? null : 'advanced' },
    preferredLanguage: { value: mode === 'quick' ? null : 'Hindi' },
    preferredResourceLanguage: { value: mode === 'quick' ? null : 'Hindi' },
    constraints: { value: [] },
    budget: { value: mode === 'quick' ? null : 100 },
  };
}

function service({ discovery, ranking } = {}) {
  return createRoadmapResourceEnrichmentService({
    discovery: discovery ?? {
      async discover() {
        return { resources: discovered, diagnostics: { partial: false } };
      },
    },
    ranking: ranking ?? {
      async rank({ resources }) {
        return { candidates: ranked(resources), rankingVersion: '1.0.0' };
      },
    },
    assignment: learningExperienceService,
    now: () => timestamp,
    log: { warn() {} },
  });
}

test('connects discovery, ranking, assignment, and automatic attachment for every task', async () => {
  const result = await service().enrich({ learningContext: context(), roadmap: roadmap() });
  const tasks = result.roadmap.phases[0].weeks[0].tasks;

  assert.equal(result.diagnostics.enrichedTaskCount, 2);
  assert.ok(tasks.every((item) => item.resources[0].purpose === 'primary'));
  assert.ok(tasks.every((item) => item.attachments.length >= 1));
  assert.ok(tasks.every((item) => item.attachments[0].type === 'youtube'));
  assert.equal(
    tasks.some((item) =>
      item.attachments.some(({ metadata }) => metadata.provider === 'official_docs'),
    ),
    false,
  );
  assert.equal(tasks[0].attachments[0].metadata.resourceId, ids.video);
  assert.equal(tasks[0].learningExperience, undefined);
  assert.deepEqual(result.diagnostics.recommendationStrategy.preferredOrder, [
    'playlist',
    'course',
    'video',
    'article',
    'documentation',
    'repository_if_project_based',
  ]);
});

test('uses official documentation only when no suitable YouTube candidate exists', async () => {
  const result = await service({
    discovery: {
      async discover() {
        return {
          resources: discovered.filter((item) => item.provider !== 'youtube'),
          diagnostics: { partial: true },
        };
      },
    },
  }).enrich({ learningContext: context(), roadmap: roadmap() });

  const tasks = result.roadmap.phases[0].weeks[0].tasks;
  assert.ok(tasks.every((item) => item.attachments[0].metadata.provider === 'official_docs'));
  assert.ok(tasks.every((item) => item.attachments[0].metadata.purpose === 'primary'));
});

test('rejects semantically weak GitHub results instead of attaching popular but unrelated repos', async () => {
  const docs = discovered.find((item) => item.provider === 'official_docs');
  const github = discovered.find((item) => item.provider === 'github');
  const result = await service({
    discovery: {
      async discover() {
        return { resources: [github, docs], diagnostics: { partial: false } };
      },
    },
    ranking: {
      async rank() {
        return {
          candidates: [
            {
              ...ranked([github])[0],
              scores: { goalMatch: 20 },
            },
            {
              ...ranked([docs])[0],
              rank: 2,
              scores: { goalMatch: 75 },
            },
          ],
          rankingVersion: '1.0.0',
        };
      },
    },
  }).enrich({ learningContext: context(), roadmap: roadmap() });

  const tasks = result.roadmap.phases[0].weeks[0].tasks;
  assert.ok(tasks.every((item) => item.attachments[0].metadata.provider === 'official_docs'));
  assert.ok(
    tasks.every((item) => item.attachments.every(({ metadata }) => metadata.provider !== 'github')),
  );
});

test('provider failure degrades only the affected task', async () => {
  const result = await service({
    discovery: {
      async discover({ task: input }) {
        if (input.title.includes('Practice')) throw new Error('provider unavailable');
        return { resources: discovered, diagnostics: { partial: true } };
      },
    },
  }).enrich({ learningContext: context(), roadmap: roadmap() });
  const tasks = result.roadmap.phases[0].weeks[0].tasks;

  assert.ok(tasks[0].attachments.length > 0);
  assert.deepEqual(tasks[1].attachments ?? [], []);
  assert.equal(result.diagnostics.partial, true);
});

test('empty discovery returns the complete roadmap without placeholders', async () => {
  const original = roadmap();
  const result = await service({
    discovery: {
      async discover() {
        return { resources: [], diagnostics: { partial: true } };
      },
    },
  }).enrich({ learningContext: context(), roadmap: original });

  assert.deepEqual(result.roadmap, original);
  assert.equal(result.diagnostics.attachmentCount, 0);
  assert.equal(result.diagnostics.partial, true);
});

test('quick mode applies free English beginner defaults before deterministic ranking', async () => {
  let rankingInput;
  const paid = resource(ids.paid, {
    provider: 'course',
    providerResourceId: 'paid-course',
    type: 'course',
    canonicalUrl: 'https://example.com/paid-course',
    title: 'Paid Course',
    accessType: 'paid',
  });
  await service({
    discovery: {
      async discover() {
        return { resources: [paid, ...discovered], diagnostics: { partial: false } };
      },
    },
    ranking: {
      async rank(input) {
        rankingInput = input;
        return { candidates: ranked(input.resources), rankingVersion: '1.0.0' };
      },
    },
  }).enrich({ learningContext: context('quick'), roadmap: roadmap() });

  assert.equal(
    rankingInput.resources.some((item) => item.accessType === 'paid'),
    false,
  );
  assert.equal(rankingInput.learningContext.currentProficiency.value, 'beginner');
  assert.equal(rankingInput.learningContext.preferredResourceLanguage.value, 'English');
  assert.ok(rankingInput.learningContext.constraints.value.includes('Use only free resources'));
});

test('personalized mode passes the existing Learning Context to ranking unchanged', async () => {
  const personalized = context('personalized');
  let rankingContext;
  await service({
    ranking: {
      async rank(input) {
        rankingContext = input.learningContext;
        return { candidates: ranked(input.resources), rankingVersion: '1.0.0' };
      },
    },
  }).enrich({ learningContext: personalized, roadmap: roadmap() });

  assert.equal(rankingContext, personalized);
  assert.equal(rankingContext.currentProficiency.value, 'advanced');
  assert.equal(rankingContext.preferredResourceLanguage.value, 'Hindi');
  assert.equal(rankingContext.budget.value, 100);
});

test('deduplicates identical discovery and ranking work during enrichment', async () => {
  let discoveryCalls = 0;
  let rankingCalls = 0;
  const duplicateRoadmap = {
    type: 'skill',
    title: 'React Roadmap',
    phases: [
      {
        key: 'phase-one',
        weeks: [
          {
            key: 'week-one',
            tasks: [
              task('react-one', { title: 'Learn React', description: 'Build React knowledge.' }),
              task('react-two', { title: 'Learn React', description: 'Build React knowledge.' }),
            ],
          },
        ],
      },
    ],
  };
  const result = await service({
    discovery: {
      async discover() {
        discoveryCalls += 1;
        return { resources: discovered, diagnostics: { partial: false } };
      },
    },
    ranking: {
      async rank({ resources }) {
        rankingCalls += 1;
        return { candidates: ranked(resources), rankingVersion: '1.0.0' };
      },
    },
  }).enrich({ learningContext: context(), roadmap: duplicateRoadmap });

  assert.equal(discoveryCalls, 1);
  assert.equal(rankingCalls, 1);
  assert.equal(result.diagnostics.performance.discoveryRequests, 1);
  assert.equal(result.diagnostics.performance.discoveryCacheHits, 1);
  assert.equal(result.diagnostics.performance.rankingRequests, 1);
  assert.equal(result.diagnostics.performance.rankingCacheHits, 1);
});

test('keeps the same creator across equivalent tasks in one phase and level', async () => {
  const creatorAFirst = resource('66666666-6666-4666-8666-666666666666', {
    providerResourceId: 'creator-a-first',
    canonicalUrl: 'https://www.youtube.com/watch?v=creator-a-first',
    type: 'video',
    title: 'Excel Basics',
    author: 'Creator A',
  });
  const creatorASecond = resource('77777777-7777-4777-8777-777777777777', {
    providerResourceId: 'creator-a-second',
    canonicalUrl: 'https://www.youtube.com/watch?v=creator-a-second',
    type: 'video',
    title: 'SQL Basics by Creator A',
    author: 'Creator A',
  });
  const creatorBSecond = resource('88888888-8888-4888-8888-888888888888', {
    providerResourceId: 'creator-b-second',
    canonicalUrl: 'https://www.youtube.com/watch?v=creator-b-second',
    type: 'video',
    title: 'SQL Basics by Creator B',
    author: 'Creator B',
  });
  const continuityRoadmap = {
    type: 'career',
    title: 'Data Analyst Roadmap',
    phases: [
      {
        key: 'beginner',
        weeks: [
          {
            key: 'week-one',
            tasks: [
              task('excel', { title: 'Learn Excel', description: 'Learn spreadsheets.' }),
              task('sql', { title: 'Learn SQL', description: 'Learn querying.' }),
            ],
          },
        ],
      },
    ],
  };

  const result = await service({
    discovery: {
      async discover({ task: input }) {
        return {
          resources: input.title.includes('Excel')
            ? [creatorAFirst]
            : [creatorBSecond, creatorASecond],
          diagnostics: { partial: false },
        };
      },
    },
    ranking: {
      async rank({ task: input }) {
        if (input.title.includes('Excel')) {
          return {
            candidates: [
              { rank: 1, resource: creatorAFirst, overallScore: 95, rankingVersion: '1.0.0' },
            ],
            rankingVersion: '1.0.0',
          };
        }
        return {
          candidates: [
            { rank: 1, resource: creatorBSecond, overallScore: 95, rankingVersion: '1.0.0' },
            { rank: 2, resource: creatorASecond, overallScore: 88, rankingVersion: '1.0.0' },
          ],
          rankingVersion: '1.0.0',
        };
      },
    },
  }).enrich({ learningContext: context(), roadmap: continuityRoadmap });

  const [excel, sql] = result.roadmap.phases[0].weeks[0].tasks;
  assert.equal(excel.attachments[0].metadata.author, 'Creator A');
  assert.equal(sql.attachments[0].metadata.author, 'Creator A');
});
