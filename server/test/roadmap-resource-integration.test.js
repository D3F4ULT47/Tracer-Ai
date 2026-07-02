import assert from 'node:assert/strict';
import test from 'node:test';
import { learningExperienceService } from '../src/modules/resources/assignment/learning-experience.service.js';
import { createRoadmapResourceEnrichmentService } from '../src/modules/resources/roadmap-resource-enrichment.service.js';

const timestamp = new Date('2026-07-02T00:00:00.000Z');

function task(key) {
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
    type: 'video',
    canonicalUrl: `https://www.youtube.com/watch?v=${resourceId.slice(0, 8)}`,
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
  assert.ok(tasks.every((item) => item.attachments.some((item) => item.type === 'github')));
  assert.ok(
    tasks.every((item) => item.attachments.some((item) => item.metadata.purpose === 'reference')),
  );
  assert.equal(tasks[0].attachments[0].metadata.resourceId, ids.video);
  assert.equal(tasks[0].learningExperience, undefined);
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
