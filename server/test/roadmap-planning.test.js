import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLearningContext } from '../src/modules/ai/learning-context/learning-context.builder.js';
import { createRoadmapPlanningService } from '../src/modules/ai/roadmap-planning/roadmap-planning.service.js';
import { validateAndRepairRoadmapGeneration } from '../src/modules/ai/roadmap-planning/roadmap-planning.validator.js';

function evidence(excerpt) {
  return { source: 'naturalLanguage', excerpt };
}

function assessment(level = 'beginner') {
  const emptyInference = {
    inferred: false,
    value: null,
    confidence: 0,
    reasoning: 'No inference required.',
    evidence: [],
  };
  return {
    schemaVersion: '1.0.0',
    currentLevel: level,
    confidence: 0.9,
    reasoning: 'The learner supplied direct proficiency evidence.',
    proficiencyEvidence: [evidence('I am a beginner learning JavaScript')],
    knownSkills: [],
    missingSkills: [],
    suggestedSkills: [],
    experienceSignals: [],
    educationSignals: [],
    technologyStack: [],
    careerDirection: emptyInference,
    projectComplexity: emptyInference,
    experienceSummary: emptyInference,
    educationSummary: emptyInference,
    technologySummary: emptyInference,
    clarificationRequired: false,
  };
}

function learningContext({
  mode = 'quick',
  goalType = 'learning_goal',
  resumeVersion = null,
} = {}) {
  return buildLearningContext({
    assessment: assessment(),
    mode,
    explicitInput: {
      primaryGoal:
        goalType === 'project' ? 'Build a React dashboard' : 'Learn frontend development',
      goalType,
      experienceLevel: 'beginner',
      weeklyHours: 10,
    },
    questionnaire: mode === 'personalized' ? { learningStyle: 'project-based' } : {},
    profile: { skills: [], education: [], experience: [], __v: 1 },
    learningProfile: { inferences: [], __v: 1 },
    sourceVersions: { resumeVersion, assessmentVersion: '1.0.0' },
  });
}

function sourceUnderstanding() {
  const sourceId = '11111111-1111-4111-8111-111111111111';
  return {
    schemaVersion: '1.0.0',
    understandingId: '22222222-2222-4222-8222-222222222222',
    generatedAt: '2026-07-02T00:00:00.000Z',
    mode: 'single',
    summary: 'A GitHub repository requiring React knowledge.',
    sourceAttributions: [
      {
        sourceId,
        sourceType: 'github_repository',
        identifier: 'example/frontend@main',
        title: 'example/frontend',
        url: 'https://github.com/example/frontend',
        creator: 'example',
        capturedAt: '2026-07-02T00:00:00.000Z',
        relevantLocations: [{ kind: 'branch', value: 'main' }],
      },
    ],
    sourceProcessing: [
      {
        sourceType: 'github_repository',
        identifier: 'https://github.com/example/frontend',
        status: 'processed',
        errorCode: null,
      },
    ],
    concepts: [],
    technologies: [],
    skills: [],
    prerequisites: [],
    dependencies: [],
    milestones: [],
    creatorRecommendations: [],
    preservedStructure: [],
    evidence: [],
    assumptions: [],
  };
}

function task(key, title, dependencies = [], difficulty = 'beginner') {
  return {
    key,
    title,
    description: `Complete ${title}.`,
    estimatedMinutes: 120,
    difficulty,
    dependencies,
    completionCriteria: [`Demonstrate ${title}.`],
    type: 'learn',
    state: 'NOT_STARTED',
    notes: [],
    resources: [],
  };
}

function completeGeneration({ type = 'skill', extraTasks = 0 } = {}) {
  const firstTasks = [task('javascript-basics', 'JavaScript Basics')];
  for (let index = 0; index < extraTasks; index += 1) {
    firstTasks.push(task(`practice-${index + 1}`, `JavaScript Practice ${index + 1}`));
  }
  const tasks = [
    ...firstTasks,
    task('react-basics', 'React Basics', ['javascript-basics'], 'intermediate'),
  ];
  const nodes = tasks.map((item) => ({
    key: item.key,
    title: item.title,
    type: 'task',
    required: true,
    taskKey: item.key,
  }));

  return {
    schemaVersion: '1.0.0',
    roadmap: {
      type,
      title: 'Frontend Development Roadmap',
      description: 'A progressive route from JavaScript foundations to React.',
      summary: 'Learn core frontend skills through applied practice.',
      estimatedWeeks: 2,
      currentLevel: 'beginner',
      weeklyCommitmentHours: 10,
      confidence: 0.9,
      missingSkills: ['React'],
      difficulty: 'intermediate',
      completionCriteria: ['Build and explain a working React application.'],
      phases: [
        {
          key: 'foundations',
          title: 'Foundations',
          description: 'Build language foundations.',
          objective: 'Use modern JavaScript confidently.',
          estimatedWeeks: 1,
          order: 1,
          state: 'NOT_STARTED',
          dependencies: [],
          milestones: ['JavaScript foundation complete'],
          projects: [],
          checkpoints: ['Explain core syntax'],
          completionCriteria: ['Complete all foundation tasks.'],
          weeks: [
            {
              key: 'week-one',
              title: 'JavaScript Foundations',
              description: 'Learn and practice JavaScript.',
              objective: 'Write small JavaScript programs.',
              weekNumber: 1,
              order: 1,
              state: 'NOT_STARTED',
              dependencies: [],
              milestones: ['First scripts complete'],
              projects: [],
              checkpoints: ['Syntax check'],
              completionCriteria: ['Finish all JavaScript tasks.'],
              tasks: firstTasks,
            },
          ],
        },
        {
          key: 'react',
          title: 'React',
          description: 'Apply JavaScript through React.',
          objective: 'Build reusable React interfaces.',
          estimatedWeeks: 1,
          order: 2,
          state: 'NOT_STARTED',
          dependencies: ['foundations'],
          milestones: ['React foundation complete'],
          projects: ['Small React interface'],
          checkpoints: ['Component review'],
          completionCriteria: ['Complete the React project.'],
          weeks: [
            {
              key: 'week-two',
              title: 'React Foundations',
              description: 'Learn React components and state.',
              objective: 'Create a small component tree.',
              weekNumber: 2,
              order: 1,
              state: 'NOT_STARTED',
              dependencies: ['week-one'],
              milestones: ['First component complete'],
              projects: ['React interface'],
              checkpoints: ['Component check'],
              completionCriteria: ['Build the component tree.'],
              tasks: [tasks.at(-1)],
            },
          ],
        },
      ],
    },
    dependencyGraph: {
      graphVersion: 1,
      nodes,
      edges: [{ from: 'javascript-basics', to: 'react-basics', type: 'prerequisite' }],
    },
  };
}

function fakeRepositories() {
  const state = { prompts: [], runs: [], usage: [], persisted: [], completed: [], failed: [] };
  return {
    state,
    repositories: {
      prompts: {
        async ensure(value) {
          state.prompts.push(value);
        },
      },
      runs: {
        async create(value) {
          state.runs.push(value);
        },
        async complete(...value) {
          state.completed.push(value);
        },
        async fail(...value) {
          state.failed.push(value);
        },
      },
      usage: {
        async record(value) {
          state.usage.push(value);
        },
      },
      async persistInitialGeneration(value) {
        state.persisted.push(value);
      },
    },
  };
}

function serviceHarness(generation, options = {}) {
  const storage = fakeRepositories();
  let providerCalls = 0;
  let providerInput;
  const service = createRoadmapPlanningService({
    flags: {
      async isEnabled() {
        return true;
      },
    },
    promptLoader: async () => ({
      name: 'roadmap-generation',
      version: '1.0.0',
      hash: 'prompt-hash',
      content: 'Generate one complete roadmap.',
    }),
    providerResolver: () => ({
      configuration: { provider: 'openai', model: 'configured-model' },
      provider: {
        async generateStructured(input) {
          providerCalls += 1;
          providerInput = input;
          return {
            data: generation,
            provider: 'openai',
            model: 'configured-model',
            providerRequestId: 'response-1',
            latencyMs: 250,
            usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
          };
        },
      },
    }),
    repositories: storage.repositories,
    enrichment: options.enrichment ?? {
      async enrich({ roadmap }) {
        return {
          roadmap,
          diagnostics: {
            taskCount: 2,
            enrichedTaskCount: 0,
            attachmentCount: 0,
            partial: true,
          },
        };
      },
    },
    log: { error() {} },
  });
  return { service, storage, calls: () => providerCalls, input: () => providerInput };
}

test('complete roadmap and graph validate as one structured generation', () => {
  const result = validateAndRepairRoadmapGeneration(completeGeneration());
  assert.equal(result.generation.roadmap.phases.length, 2);
  assert.equal(result.generation.dependencyGraph.nodes.length, 2);
  assert.equal(result.validation.semanticValid, true);
});

test('safe structural inconsistencies are repaired before persistence', () => {
  const generation = completeGeneration();
  generation.roadmap.estimatedWeeks = 8;
  generation.roadmap.phases[0].order = 3;
  generation.roadmap.phases[0].state = 'COMPLETED';
  generation.dependencyGraph.edges = [];

  const result = validateAndRepairRoadmapGeneration(generation);
  assert.equal(result.generation.roadmap.estimatedWeeks, 2);
  assert.equal(result.generation.roadmap.phases[0].order, 1);
  assert.equal(result.generation.roadmap.phases[0].state, 'NOT_STARTED');
  assert.equal(result.generation.dependencyGraph.edges.length, 1);
  assert.ok(result.validation.issues.length >= 3);
});

test('circular planning dependencies are rejected', () => {
  const generation = completeGeneration();
  generation.dependencyGraph.edges.push({
    from: 'react-basics',
    to: 'javascript-basics',
    type: 'prerequisite',
  });
  assert.throws(
    () => validateAndRepairRoadmapGeneration(generation),
    (error) => error.code === 'ROADMAP_SEMANTIC_VALIDATION_FAILED',
  );
});

test('large and small roadmaps both retain balanced complete structures', () => {
  assert.equal(
    validateAndRepairRoadmapGeneration(completeGeneration()).generation.roadmap.phases.length,
    2,
  );
  const large = validateAndRepairRoadmapGeneration(completeGeneration({ extraTasks: 3 }));
  assert.equal(large.generation.roadmap.phases[0].weeks[0].tasks.length, 4);
});

for (const scenario of [
  { name: 'career quick mode', context: { goalType: 'career_goal' }, type: 'career' },
  {
    name: 'project personalized mode',
    context: { goalType: 'project', mode: 'personalized' },
    type: 'project',
  },
  { name: 'resume-based mode', context: { resumeVersion: 3 }, type: 'resume' },
]) {
  test(`one-pass generation persists a ${scenario.name} roadmap and hides its graph`, async () => {
    const generation = completeGeneration({ type: scenario.type });
    const harness = serviceHarness(generation);
    const context = learningContext(scenario.context);
    const result = await harness.service.generate({
      ownerId: '507f1f77bcf86cd799439011',
      requestId: 'request-1',
      context,
    });

    assert.equal(harness.calls(), 1);
    assert.deepEqual(Object.keys(JSON.parse(harness.input().input)), ['learningContext']);
    assert.doesNotMatch(JSON.stringify(harness.input().schema), /"\$ref":"https:/);
    assert.equal(result.roadmap.type, scenario.type);
    assert.equal('dependencyGraph' in result, false);
    assert.equal(harness.storage.state.persisted.length, 1);
    assert.equal(harness.storage.state.persisted[0].generation.planningGraph.graphVersion, 1);
    assert.equal(harness.storage.state.persisted[0].version.planningGraphSnapshot.graphVersion, 1);
    assert.equal(harness.storage.state.persisted[0].version.version, 1);
    assert.equal(harness.storage.state.persisted[0].context.learningContext, context);
    assert.equal(harness.storage.state.persisted[0].activity.activityType, 'ROADMAP_CREATED');
    assert.equal(harness.storage.state.persisted[0].activity.roadmapTitle, result.roadmap.title);
    assert.equal(harness.storage.state.completed.length, 1);
  });
}

test('generation stops before the provider when Learning Context still needs clarification', async () => {
  const context = structuredClone(learningContext({ mode: 'personalized' }));
  context.primaryGoal = { ...context.primaryGoal, value: null, status: 'unresolved' };
  const harness = serviceHarness(completeGeneration());

  await assert.rejects(
    harness.service.generate({
      ownerId: '507f1f77bcf86cd799439011',
      requestId: 'request-1',
      context,
    }),
    (error) => error.code === 'LEARNING_CONTEXT_REQUIRES_CLARIFICATION',
  );
  assert.equal(harness.calls(), 0);
});

test('quick mode never interrupts generation with a clarification', async () => {
  const context = structuredClone(learningContext({ mode: 'quick' }));
  context.primaryGoal = { ...context.primaryGoal, value: null, status: 'unresolved' };
  const harness = serviceHarness(completeGeneration());

  const result = await harness.service.generate({
    ownerId: '507f1f77bcf86cd799439011',
    requestId: 'quick-request',
    context,
  });
  assert.equal(harness.calls(), 1);
  assert.equal(result.roadmap.title, 'Frontend Development Roadmap');
});

test('source understanding reaches planning and attribution persistence without changing roadmap output', async () => {
  const harness = serviceHarness(completeGeneration());
  const understanding = sourceUnderstanding();
  understanding.mode = 'mixed';
  understanding.sourceAttributions.push({
    sourceId: '33333333-3333-4333-8333-333333333333',
    sourceType: 'natural_prompt',
    identifier: 'natural_prompt:frontend-goal',
    title: 'Natural prompt',
    url: null,
    creator: null,
    capturedAt: '2026-07-02T00:00:00.000Z',
    relevantLocations: [],
  });
  understanding.sourceProcessing.push({
    sourceType: 'natural_prompt',
    identifier: null,
    status: 'processed',
    errorCode: null,
  });
  const result = await harness.service.generate({
    ownerId: '507f1f77bcf86cd799439011',
    requestId: 'source-request',
    context: learningContext(),
    sourceUnderstanding: understanding,
  });

  assert.deepEqual(JSON.parse(harness.input().input).sourceUnderstanding, understanding);
  assert.equal(harness.storage.state.persisted[0].context.sourceUnderstanding, understanding);
  assert.deepEqual(
    harness.storage.state.persisted[0].context.sourceAttributions,
    understanding.sourceAttributions,
  );
  assert.equal(harness.storage.state.runs[0].inputType, 'combined');
  assert.equal(result.roadmap.title, 'Frontend Development Roadmap');
});

test('resource enrichment is included in Version 1 persistence and the synchronous response', async () => {
  const resourceId = '33333333-3333-4333-8333-333333333333';
  const harness = serviceHarness(completeGeneration(), {
    enrichment: {
      async enrich({ roadmap }) {
        const enriched = structuredClone(roadmap);
        const task = enriched.phases[0].weeks[0].tasks[0];
        task.resources = [
          {
            resourceId,
            purpose: 'primary',
            sourceRank: 1,
            rankingVersion: '1.0.0',
          },
        ];
        task.attachments = [
          {
            attachmentId: '44444444-4444-4444-8444-444444444444',
            type: 'external_url',
            url: 'https://react.dev/',
            title: 'React Documentation',
            description: null,
            metadata: {
              provider: 'official_docs',
              host: 'react.dev',
              identifier: 'react-docs',
              resourceId,
              purpose: 'primary',
              rankingVersion: '1.0.0',
              author: 'React Team',
              thumbnailUrl: null,
            },
            createdAt: '2026-07-02T00:00:00.000Z',
            updatedAt: '2026-07-02T00:00:00.000Z',
          },
        ];
        return {
          roadmap: enriched,
          diagnostics: {
            taskCount: 2,
            enrichedTaskCount: 1,
            attachmentCount: 1,
            partial: true,
          },
        };
      },
    },
  });
  const result = await harness.service.generate({
    ownerId: '507f1f77bcf86cd799439011',
    requestId: 'resource-request',
    context: learningContext(),
  });

  assert.equal(result.version, 1);
  assert.equal(result.roadmap.phases[0].weeks[0].tasks[0].resources[0].resourceId, resourceId);
  assert.equal(
    harness.storage.state.persisted[0].version.snapshot.phases[0].weeks[0].tasks[0].attachments[0]
      .metadata.resourceId,
    resourceId,
  );
  assert.equal(
    harness.storage.state.persisted[0].generation.generationParameters.resourceEnrichment
      .attachmentCount,
    1,
  );
});

test('anonymous preview generates the complete roadmap without persistence', async () => {
  const harness = serviceHarness(completeGeneration());
  const result = await harness.service.generate({
    ownerId: null,
    requestId: 'anonymous-request',
    context: learningContext(),
    persist: false,
  });

  assert.equal(harness.calls(), 1);
  assert.equal(harness.storage.state.persisted.length, 0);
  assert.equal(result.roadmapId, null);
  assert.equal(result.version, 0);
  assert.equal(result.roadmap.phases.length, 2);
  assert.equal(harness.storage.state.completed[0][1], null);
});
