import assert from 'node:assert/strict';
import test from 'node:test';
import { createLearningExperienceService } from '../src/modules/resources/assignment/learning-experience.service.js';

const generatedAt = new Date('2026-07-02T00:00:00.000Z');

function task(key, type = 'learn') {
  return {
    key,
    title: key === 'react-hooks' ? 'React Hooks' : 'React Practice',
    description: `Learn and apply ${key}.`,
    estimatedMinutes: 90,
    difficulty: 'intermediate',
    dependencies: [],
    completionCriteria: [`Demonstrate ${key}.`],
    type,
    state: 'NOT_STARTED',
    notes: [],
    resources: [],
  };
}

function roadmap(tasks = [task('react-hooks')]) {
  return {
    type: 'skill',
    title: 'React Roadmap',
    phases: [
      {
        key: 'react',
        weeks: [{ key: 'week-one', tasks }],
      },
    ],
  };
}

const ids = {
  docs: '11111111-1111-4111-8111-111111111111',
  video: '22222222-2222-4222-8222-222222222222',
  repo: '33333333-3333-4333-8333-333333333333',
  reference: '44444444-4444-4444-8444-444444444444',
  paid: '55555555-5555-4555-8555-555555555555',
};

function candidate(resourceId, rank, type, provider, accessType = 'free') {
  return {
    rank,
    resource: { resourceId, type, provider, accessType },
    overallScore: 100 - rank,
    rankingVersion: '1.0.0',
  };
}

function candidates() {
  return [
    candidate(ids.video, 1, 'video', 'youtube'),
    candidate(ids.docs, 2, 'documentation', 'official_docs'),
    candidate(ids.repo, 3, 'repository', 'github'),
    candidate(ids.reference, 4, 'reference', 'official_docs'),
  ];
}

function input(overrides = {}) {
  return {
    learningContext: {
      weeklyHours: { value: 8 },
      budget: { value: 0 },
      constraints: { value: ['Use only free resources'] },
    },
    roadmap: roadmap(),
    rankedCandidatesByTask: [{ taskKey: 'react-hooks', candidates: candidates() }],
    ...overrides,
  };
}

function service() {
  return createLearningExperienceService({ now: () => generatedAt });
}

test('assigns a balanced, reference-only learning experience deterministically', () => {
  const first = service().assign(input());
  const second = service().assign(input());
  assert.deepEqual(first, second);

  const [assignment] = first.assignments;
  assert.equal(assignment.resourceLinks[0].purpose, 'primary');
  assert.equal(assignment.resourceLinks[0].resourceId, ids.video);
  assert.ok(assignment.resourceLinks.some(({ purpose }) => purpose === 'practice'));
  assert.ok(assignment.resourceLinks.some(({ purpose }) => purpose === 'reference'));
  assert.equal(assignment.checkpoint.type, 'knowledge_check');
  assert.equal(assignment.estimatedCompletionMinutes, 90);
  assert.equal(first.assignmentVersion, '1.0.0');
  assert.equal(first.generatedAt, generatedAt.toISOString());

  const resourceIds = assignment.resourceLinks.map(({ resourceId }) => resourceId);
  assert.equal(new Set(resourceIds).size, resourceIds.length);
  for (const link of assignment.resourceLinks) {
    assert.deepEqual(Object.keys(link).sort(), [
      'purpose',
      'rankingVersion',
      'resourceId',
      'sourceRank',
    ]);
  }
});

test('enriches tasks without changing the roadmap hierarchy or input object', () => {
  const original = input();
  const before = structuredClone(original.roadmap);
  const enriched = service().enrich(original);
  const enrichedTask = enriched.roadmap.phases[0].weeks[0].tasks[0];

  assert.deepEqual(original.roadmap, before);
  assert.equal(enriched.roadmap.phases.length, before.phases.length);
  assert.equal(enriched.roadmap.phases[0].weeks.length, before.phases[0].weeks.length);
  assert.equal(enrichedTask.learningExperience.taskKey, 'react-hooks');
  assert.deepEqual(enrichedTask.resources, enrichedTask.learningExperience.resourceLinks);
  assert.equal('canonicalUrl' in enrichedTask.resources[0], false);
  assert.equal('title' in enrichedTask.resources[0], false);
});

test('reuses a canonical resource across tasks while avoiding duplicates within each task', () => {
  const tasks = [task('react-hooks'), task('react-practice', 'practice')];
  const rankedCandidatesByTask = tasks.map(({ key }) => ({
    taskKey: key,
    candidates: [candidates()[0], candidates()[0], ...candidates().slice(1)],
  }));
  const result = service().assign(input({ roadmap: roadmap(tasks), rankedCandidatesByTask }));

  assert.equal(result.assignments.length, 2);
  assert.ok(result.assignments.every(({ resourceLinks }) => resourceLinks.length > 0));
  for (const assignment of result.assignments) {
    const assignedIds = assignment.resourceLinks.map(({ resourceId }) => resourceId);
    assert.equal(new Set(assignedIds).size, assignedIds.length);
  }
  assert.ok(
    result.assignments.every(({ resourceLinks }) =>
      resourceLinks.some(({ resourceId }) => resourceId === ids.video),
    ),
  );
  assert.ok(result.assignments[1].miniProject);
});

test('does not assign paid resources when free candidates are sufficient', () => {
  const result = service().assign(
    input({
      rankedCandidatesByTask: [
        {
          taskKey: 'react-hooks',
          candidates: [
            candidate(ids.paid, 1, 'course', 'course_provider', 'paid'),
            ...candidates().map((value) => ({ ...value, rank: value.rank + 1 })),
          ],
        },
      ],
    }),
  );

  assert.equal(
    result.assignments[0].resourceLinks.some(({ resourceId }) => resourceId === ids.paid),
    false,
  );
});

test('explicit paid-resource budget permits a paid primary candidate', () => {
  const result = service().assign(
    input({
      learningContext: { weeklyHours: { value: 8 }, budget: { value: 100 } },
      rankedCandidatesByTask: [
        {
          taskKey: 'react-hooks',
          candidates: [
            candidate(ids.paid, 1, 'course', 'course_provider', 'paid'),
            ...candidates().map((value) => ({ ...value, rank: value.rank + 1 })),
          ],
        },
      ],
    }),
  );

  assert.equal(result.assignments[0].resourceLinks[0].resourceId, ids.paid);
});

test('limited weekly time constrains alternatives without removing core roles', () => {
  const result = service().assign(
    input({
      learningContext: { weeklyHours: { value: 3 }, budget: { value: 0 } },
    }),
  );
  assert.ok(
    result.assignments[0].resourceLinks.filter(({ purpose }) => purpose === 'alternative').length <=
      1,
  );
  assert.equal(result.assignments[0].resourceLinks[0].purpose, 'primary');
});

test('falls back to one actionable primary when optional resource roles are unavailable', () => {
  const articleId = '66666666-6666-4666-8666-666666666666';
  const result = service().assign(
    input({
      roadmap: roadmap([task('react-practice', 'practice')]),
      rankedCandidatesByTask: [
        {
          taskKey: 'react-practice',
          candidates: [candidate(articleId, 1, 'article', 'curated')],
        },
      ],
    }),
  );

  assert.deepEqual(result.assignments[0].resourceLinks, [
    {
      resourceId: articleId,
      purpose: 'primary',
      sourceRank: 1,
      rankingVersion: '1.0.0',
    },
  ]);
  assert.ok(result.assignments[0].miniProject);
});

test('fails atomically when a task has no primary candidate', () => {
  assert.throws(
    () =>
      service().assign(
        input({ rankedCandidatesByTask: [{ taskKey: 'react-hooks', candidates: [] }] }),
      ),
    (error) => error.code === 'RESOURCE_ASSIGNMENT_PRIMARY_REQUIRED',
  );
});

test('rejects incomplete and duplicate task candidate mappings', () => {
  const tasks = [task('react-hooks'), task('react-practice', 'practice')];
  assert.throws(
    () =>
      service().assign(
        input({
          roadmap: roadmap(tasks),
          rankedCandidatesByTask: [
            { taskKey: 'react-hooks', candidates: candidates() },
            { taskKey: 'react-hooks', candidates: candidates() },
          ],
        }),
      ),
    (error) => error.code === 'RESOURCE_ASSIGNMENT_TASK_MAPPING_INVALID',
  );
});
