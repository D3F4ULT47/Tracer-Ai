import assert from 'node:assert/strict';
import test from 'node:test';
import { RoadmapContext } from '../src/modules/roadmaps/models/roadmap-context.model.js';
import { Roadmap } from '../src/modules/roadmaps/models/roadmap.model.js';
import { presentWorkspace } from '../src/modules/roadmaps/roadmap-presenter.js';
import { createRoadmapService } from '../src/modules/roadmaps/roadmap.service.js';

function task(key, state = 'NOT_STARTED', dependencies = []) {
  return {
    key,
    title: key,
    description: `Description for ${key}`,
    estimatedMinutes: key === 'task-one' ? 60 : 180,
    difficulty: 'beginner',
    dependencies,
    completionCriteria: ['Done'],
    type: 'learn',
    state,
    notes: [],
    resources: [],
    attachments: [],
  };
}

function roadmap() {
  return {
    roadmapId: 'd2e4439c-8f14-47dd-9280-a2a3cc1029fd',
    ownerId: '507f1f77bcf86cd799439011',
    contextId: '507f1f77bcf86cd799439012',
    currentVersion: 1,
    revision: 0,
    type: 'skill',
    title: 'Frontend Roadmap',
    description: 'Learn frontend engineering.',
    summary: 'A practical learning sequence.',
    estimatedWeeks: 1,
    currentLevel: 'beginner',
    weeklyCommitmentHours: 10,
    missingSkills: [],
    aiConfidence: 0.9,
    difficulty: 'intermediate',
    completionCriteria: ['Build an application'],
    status: 'active',
    visibility: 'PRIVATE',
    publishedAt: null,
    deletedAt: null,
    lastOpenedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    phases: [
      {
        key: 'phase-one',
        title: 'Foundations',
        description: 'Learn foundations.',
        objective: 'Understand basics.',
        estimatedWeeks: 1,
        order: 1,
        state: 'NOT_STARTED',
        dependencies: [],
        milestones: ['Foundation complete'],
        projects: [],
        checkpoints: [],
        completionCriteria: ['Complete tasks'],
        weeks: [
          {
            key: 'week-one',
            title: 'Week one',
            description: 'Start learning.',
            objective: 'Complete basics.',
            weekNumber: 1,
            order: 1,
            state: 'NOT_STARTED',
            dependencies: [],
            milestones: ['First milestone'],
            projects: [],
            checkpoints: [],
            completionCriteria: ['Complete tasks'],
            tasks: [task('task-one'), task('task-two', 'NOT_STARTED', ['task-one'])],
          },
        ],
      },
    ],
  };
}

function version(number = 1) {
  return {
    version: number,
    generatedAt: new Date('2026-01-01T00:00:00.000Z'),
    learningContextVersion: 3,
    promptVersion: '1.0.0',
    model: 'configured-model',
    planningGraphSnapshot: {
      graphVersion: 1,
      nodes: [
        { key: 'task-one', title: 'task-one', type: 'task', required: true, taskKey: 'task-one' },
        { key: 'task-two', title: 'task-two', type: 'task', required: true, taskKey: 'task-two' },
      ],
      edges: [{ from: 'task-one', to: 'task-two', type: 'prerequisite' }],
    },
  };
}

function harness() {
  const state = {
    roadmap: roadmap(),
    graph: version().planningGraphSnapshot,
    summaries: [],
    activities: [],
    context: {
      learningContext: { careerGoal: { value: 'Frontend Engineer' } },
      sourceAttributions: [
        {
          sourceId: '11111111-1111-4111-8111-111111111111',
          sourceType: 'github_repository',
          identifier: 'example/frontend@main',
          title: 'example/frontend',
          url: 'https://github.com/example/frontend',
          creator: 'example',
          capturedAt: '2026-01-01T00:00:00.000Z',
          relevantLocations: [],
        },
      ],
    },
  };
  const repository = {
    async list() {
      return [state.roadmap];
    },
    async get() {
      return {
        roadmap: state.roadmap,
        currentVersion: version(),
        initialVersion: version(),
        context: state.context,
      };
    },
    async adoptAnonymous(input) {
      state.adoption = input;
      state.roadmap.ownerId = input.ownerId;
      return {
        roadmap: state.roadmap,
        currentVersion: version(),
        initialVersion: version(),
        context: state.context,
      };
    },
    async mutate({ revision, changeSummary, apply }) {
      assert.equal(revision, state.roadmap.revision);
      const graph = structuredClone(state.graph);
      const activity = await apply({ roadmap: state.roadmap, planningGraph: graph });
      state.graph = graph;
      state.roadmap.currentVersion += 1;
      state.roadmap.revision += 1;
      state.roadmap.updatedAt = new Date();
      state.summaries.push(changeSummary);
      state.activities.push(activity);
      return {
        roadmap: state.roadmap,
        currentVersion: version(state.roadmap.currentVersion),
        initialVersion: version(),
        context: state.context,
      };
    },
    async duplicate() {
      throw new Error('Not used');
    },
    async softDelete() {
      return { roadmapId: state.roadmap.roadmapId, deletedAt: new Date().toISOString() };
    },
    async setVisibility({ revision, visibility }) {
      assert.equal(revision, state.roadmap.revision);
      state.roadmap.visibility = visibility;
      state.roadmap.publishedAt = visibility === 'PUBLIC' ? new Date() : null;
      state.roadmap.revision += 1;
      return {
        roadmap: state.roadmap,
        currentVersion: version(state.roadmap.currentVersion),
        initialVersion: version(),
        context: state.context,
      };
    },
  };
  return { state, service: createRoadmapService({ repository }) };
}

test('roadmap progress is task-authoritative and duration weighted', async () => {
  const { service } = harness();
  const workspace = await service.get('owner', 'roadmap');
  assert.equal(workspace.progress.percentage, 0);
  assert.equal(workspace.progress.totalMinutes, 240);
  assert.equal(workspace.currentPhase, 'Foundations');
  assert.equal(workspace.metadata.targetRole, 'Frontend Engineer');
  assert.deepEqual(workspace.metadata.sourceTypes, ['github_repository']);
  assert.equal(workspace.sourceAttributions.length, 1);
});

test('workspace presenter serializes persisted Mongoose context arrays safely', () => {
  const persistedRoadmap = new Roadmap(roadmap());
  persistedRoadmap.phases[0].weeks[0].tasks[0].attachments = [
    {
      attachmentId: '33333333-3333-4333-8333-333333333333',
      type: 'external_url',
      url: 'https://developer.mozilla.org/docs/Web/JavaScript',
      title: 'MDN JavaScript Guide',
      description: null,
      metadata: {
        provider: 'official_docs',
        host: 'developer.mozilla.org',
        identifier: 'javascript-guide',
        purpose: 'primary',
      },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ];
  const persistedContext = new RoadmapContext({
    roadmapId: persistedRoadmap.roadmapId,
    ownerId: persistedRoadmap.ownerId,
    contextVersion: 3,
    contextHash: 'context-hash',
    learningContext: { careerGoal: { value: 'Frontend Engineer' } },
    sourceAttributions: [
      {
        sourceId: '11111111-1111-4111-8111-111111111111',
        sourceType: 'github_repository',
        identifier: 'example/frontend@main',
        title: 'example/frontend',
        url: 'https://github.com/example/frontend',
        creator: 'example',
        capturedAt: new Date('2026-01-01T00:00:00.000Z'),
        relevantLocations: [],
      },
    ],
  });

  const workspace = presentWorkspace(persistedRoadmap, version(), version(), persistedContext);

  assert.equal(workspace.sourceAttributions.length, 1);
  assert.equal(workspace.sourceAttributions[0].capturedAt, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(workspace.sourceAttributions[0].relevantLocations, []);
  assert.equal(
    workspace.phases[0].weeks[0].tasks[0].attachments[0].metadata.provider,
    'official_docs',
  );
});

test('anonymous roadmap adoption returns the same roadmap with preserved task work', async () => {
  const { service, state } = harness();
  state.roadmap.ownerId = null;
  state.roadmap.phases[0].weeks[0].tasks[0].state = 'COMPLETED';
  state.roadmap.phases[0].weeks[0].tasks[0].notes = [
    {
      noteId: 'note-one',
      content: 'Keep this note.',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ];
  state.roadmap.phases[0].weeks[0].tasks[0].attachments = [
    {
      attachmentId: '33333333-3333-4333-8333-333333333333',
      type: 'external_url',
      url: 'https://developer.mozilla.org/docs/Web/JavaScript',
      title: 'MDN JavaScript Guide',
      description: null,
      metadata: {
        provider: 'official_docs',
        host: 'developer.mozilla.org',
        identifier: 'javascript-guide',
        purpose: 'primary',
      },
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    },
  ];

  const workspace = await service.adoptAnonymous({
    ownerId: '507f1f77bcf86cd799439011',
    roadmapId: state.roadmap.roadmapId,
    anonymousSessionId: '99999999-9999-4999-8999-999999999999',
  });

  assert.deepEqual(state.adoption, {
    ownerId: '507f1f77bcf86cd799439011',
    roadmapId: state.roadmap.roadmapId,
    anonymousSessionId: '99999999-9999-4999-8999-999999999999',
  });
  assert.equal(workspace.roadmapId, state.roadmap.roadmapId);
  assert.equal(workspace.phases[0].weeks[0].tasks[0].state, 'COMPLETED');
  assert.equal(workspace.phases[0].weeks[0].tasks[0].notes[0].content, 'Keep this note.');
  assert.equal(
    workspace.phases[0].weeks[0].tasks[0].attachments[0].url,
    'https://developer.mozilla.org/docs/Web/JavaScript',
  );
});

test('completing every task derives completed week and phase state', async () => {
  const { service, state } = harness();
  await service.updateNode({
    ownerId: 'owner',
    roadmapId: 'roadmap',
    revision: 0,
    nodeType: 'week',
    nodeKey: 'week-one',
    changes: { state: 'COMPLETED' },
    confirmedProtectedEdit: true,
  });
  assert.ok(state.roadmap.phases[0].weeks[0].tasks.every((item) => item.state === 'COMPLETED'));
  assert.equal(state.roadmap.phases[0].weeks[0].state, 'COMPLETED');
  assert.equal(state.roadmap.phases[0].state, 'COMPLETED');
  assert.equal(state.roadmap.currentVersion, 2);
  assert.equal(state.activities[0].activityType, 'ROADMAP_UPDATED');
});

test('completed content requires explicit confirmation before editing', async () => {
  const { service, state } = harness();
  state.roadmap.phases[0].weeks[0].tasks[0].state = 'COMPLETED';
  await assert.rejects(
    service.updateNode({
      ownerId: 'owner',
      roadmapId: 'roadmap',
      revision: 0,
      nodeType: 'task',
      nodeKey: 'task-one',
      changes: { title: 'Changed' },
    }),
    (error) => error.code === 'ROADMAP_PROTECTED_EDIT_CONFIRMATION_REQUIRED',
  );
});

test('task insertion updates the graph snapshot without regenerating it', async () => {
  const { service, state } = harness();
  await service.createNode({
    ownerId: 'owner',
    roadmapId: 'roadmap',
    revision: 0,
    nodeType: 'task',
    parentKey: 'week-one',
    data: { title: 'New practice task' },
  });
  assert.equal(state.roadmap.phases[0].weeks[0].tasks.length, 3);
  assert.equal(state.graph.nodes.length, 3);
  assert.equal(state.roadmap.currentVersion, 2);
  assert.equal(state.activities[0].activityType, 'TASK_ADDED');
});

test('deleting a prerequisite is rejected while dependents remain', async () => {
  const { service } = harness();
  await assert.rejects(
    service.deleteNode({
      ownerId: 'owner',
      roadmapId: 'roadmap',
      revision: 0,
      nodeType: 'task',
      nodeKey: 'task-one',
    }),
    (error) => error.code === 'ROADMAP_DEPENDENCY_CONFLICT',
  );
});

test('task attachments normalize provider metadata and create a roadmap version', async () => {
  const { service, state } = harness();
  const workspace = await service.updateNode({
    ownerId: 'owner',
    roadmapId: 'roadmap',
    revision: 0,
    nodeType: 'task',
    nodeKey: 'task-one',
    changes: {
      attachments: [
        {
          type: 'youtube',
          url: 'https://www.youtube.com/watch?v=video123',
          title: 'JavaScript tutorial',
        },
        {
          type: 'github',
          url: 'https://github.com/example/frontend',
        },
        {
          type: 'pdf',
          url: 'https://example.com/reference.pdf',
        },
        {
          type: 'google_doc',
          url: 'https://docs.google.com/document/d/document123/edit',
        },
        {
          type: 'external_url',
          url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
        },
      ],
    },
  });

  const attachments = state.roadmap.phases[0].weeks[0].tasks[0].attachments;
  assert.equal(attachments.length, 5);
  assert.equal(attachments[0].metadata.videoId, 'video123');
  assert.equal(attachments[1].metadata.identifier, 'example/frontend');
  assert.equal(attachments[2].metadata.fileName, 'reference.pdf');
  assert.equal(attachments[3].metadata.documentId, 'document123');
  assert.equal(workspace.currentVersion, 2);
  assert.equal(workspace.phases[0].weeks[0].tasks[0].attachments.length, 5);
  assert.equal(state.activities[0].activityType, 'RESOURCE_ATTACHED');
});

test('task completion, rename, and notes emit specific activity descriptors', async () => {
  const completed = harness();
  await completed.service.updateNode({
    ownerId: 'owner',
    roadmapId: 'roadmap',
    revision: 0,
    nodeType: 'task',
    nodeKey: 'task-one',
    changes: { state: 'COMPLETED' },
  });
  assert.equal(completed.state.activities[0].activityType, 'TASK_COMPLETED');

  const renamed = harness();
  await renamed.service.updateNode({
    ownerId: 'owner',
    roadmapId: 'roadmap',
    revision: 0,
    nodeType: 'task',
    nodeKey: 'task-one',
    changes: { title: 'Renamed task' },
  });
  assert.equal(renamed.state.activities[0].activityType, 'TASK_RENAMED');

  const noted = harness();
  await noted.service.updateNode({
    ownerId: 'owner',
    roadmapId: 'roadmap',
    revision: 0,
    nodeType: 'task',
    nodeKey: 'task-one',
    changes: { notes: [{ content: 'Remember this.' }] },
  });
  assert.equal(noted.state.activities[0].activityType, 'NOTE_ADDED');
});

test('owner visibility changes return the same roadmap as public or private', async () => {
  const { service } = harness();
  const published = await service.setVisibility({
    ownerId: 'owner',
    roadmapId: 'roadmap',
    revision: 0,
    visibility: 'PUBLIC',
  });
  assert.equal(published.visibility, 'PUBLIC');
  assert.ok(published.publishedAt);
});

test('task attachment validation rejects unsafe, duplicate, and container-scoped content', async () => {
  const unsafe = harness();
  await assert.rejects(
    unsafe.service.updateNode({
      ownerId: 'owner',
      roadmapId: 'roadmap',
      revision: 0,
      nodeType: 'task',
      nodeKey: 'task-one',
      changes: {
        attachments: [{ type: 'external_url', url: 'http://example.com' }],
      },
    }),
    (error) => error.code === 'TASK_ATTACHMENT_URL_UNSAFE',
  );

  const duplicate = harness();
  await assert.rejects(
    duplicate.service.updateNode({
      ownerId: 'owner',
      roadmapId: 'roadmap',
      revision: 0,
      nodeType: 'task',
      nodeKey: 'task-one',
      changes: {
        attachments: [
          { type: 'external_url', url: 'https://example.com/reference' },
          { type: 'external_url', url: 'https://example.com/reference' },
        ],
      },
    }),
    (error) => error.code === 'TASK_ATTACHMENT_DUPLICATE',
  );

  const container = harness();
  await assert.rejects(
    container.service.updateNode({
      ownerId: 'owner',
      roadmapId: 'roadmap',
      revision: 0,
      nodeType: 'phase',
      nodeKey: 'phase-one',
      changes: { notes: [{ content: 'Not allowed on phases' }] },
    }),
    (error) => error.code === 'TASK_CONTENT_SCOPE_INVALID',
  );
});
