import assert from 'node:assert/strict';
import test from 'node:test';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { preparationSchema } from '@tracer-ai/shared/contracts';
import { AppError } from '../src/shared/app-error.js';
import { createAiResultStore } from '../src/infrastructure/cache/ai-result-store.js';
import { createAssessmentService } from '../src/modules/ai/assessment/assessment.service.js';
import { createPreparationService } from '../src/modules/ai/preparation/preparation.service.js';
import { createReuseLayer } from '../src/modules/ai/reuse/reusable-provider.js';
import { learnerScope } from '../src/modules/ai/reuse/reuse-scope.js';
import { SourceHandlerRegistry } from '../src/modules/ai/source-understanding/source-handler.registry.js';
import { registerDefaultSourceHandlers } from '../src/modules/ai/source-understanding/source.handlers.js';
import { createSourceUnderstandingService } from '../src/modules/ai/source-understanding/source-understanding.service.js';

const fixedNow = new Date('2026-10-11T00:00:00.000Z');
const flagNames = {
  routed: 'ai-routed-preparation',
  assessment: 'ai-learner-assessment',
};
const goal = 'Build the project described in the brief';
const selfDescription =
  "I've worked 3 years as a Node.js backend developer. Built a React dashboard";
const pdfSource = {
  type: 'pdf',
  content: '# Requirements\nBuild a REST API with authentication.\n\n# Milestones\nShip an MVP.',
  metadata: { fileName: 'brief.pdf', pageCount: 1 },
};
const resumeSource = {
  type: 'resume',
  content: 'EXPERIENCE\nBuilt a React dashboard.',
  metadata: { fileName: 'resume.pdf', pageCount: 1 },
};
const githubSource = { type: 'github_repository', url: 'https://github.com/example/missing' };

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validatePreparation = ajv.compile(preparationSchema);

function repositories() {
  const state = { runs: [], usage: [], failed: [] };
  return {
    state,
    prompts: { async ensure() {} },
    runs: {
      async create(value) {
        state.runs.push(value);
      },
      async complete() {},
      async fail(runId, error) {
        state.failed.push(error.code);
      },
    },
    usage: {
      async record(value) {
        state.usage.push(value);
      },
    },
  };
}

function prompt(name, version) {
  return { name, version, hash: `${name}-hash`, content: `Prompt ${name}` };
}

function understandingData(sources) {
  const source = sources.find((entry) => entry.type !== 'natural_prompt') ?? sources[0];
  return {
    schemaVersion: '1.1.0',
    understandingId: '11111111-1111-4111-8111-111111111111',
    generatedAt: fixedNow.toISOString(),
    mode: sources.length > 1 ? 'mixed' : 'single',
    summary: 'The brief asks for an authenticated REST API.',
    sourceAttributions: sources.map((entry) => entry.attribution),
    concepts: [
      {
        name: 'REST APIs',
        confidence: 0.9,
        evidenceIds: ['E1'],
        reasoning: 'The brief requires a REST API.',
      },
    ],
    technologies: [],
    skills: [],
    prerequisites: [],
    dependencies: [],
    milestones: [],
    creatorRecommendations: [],
    preservedStructure: [],
    evidence: [
      {
        evidenceId: 'E1',
        sourceId: source.sourceId,
        locator: 'Requirements',
        excerpt: 'Build a REST API with authentication.',
      },
    ],
    assumptions: [],
    requirements: [
      {
        id: 'R1',
        statement: 'Build a REST API with authentication',
        kind: 'deliverable',
        origin: 'source_fact',
        criticality: 'critical',
        evidenceIds: ['E1'],
      },
    ],
  };
}

function assessmentData(excerpt, source = 'naturalLanguage') {
  const evidence = [{ source, excerpt }];
  const absent = {
    inferred: false,
    value: null,
    confidence: 0,
    reasoning: 'No supporting evidence was provided.',
    evidence: [],
  };
  const skill = {
    name: 'Node.js',
    category: 'programming',
    confidence: 0.9,
    reasoning: 'The learner describes backend work.',
    evidence,
  };
  return {
    schemaVersion: '1.0.0',
    currentLevel: 'intermediate',
    confidence: 0.82,
    reasoning: 'The learner describes sustained backend experience.',
    proficiencyEvidence: evidence,
    knownSkills: [skill],
    missingSkills: [],
    suggestedSkills: [],
    experienceSignals: [],
    educationSignals: [],
    technologyStack: [skill],
    careerDirection: absent,
    projectComplexity: absent,
    experienceSummary: absent,
    educationSummary: absent,
    technologySummary: absent,
    clarificationRequired: false,
  };
}

function harness({
  flags = [flagNames.routed, flagNames.assessment],
  combined = 'success',
  understanding = 'success',
  assessment = 'success',
  reuseLayer = null,
  failurePolicy = 'degraded',
} = {}) {
  const calls = {
    resolver: [],
    providerInputs: [],
    understand: [],
    assess: [],
    contexts: [],
    prompts: [],
  };
  const storage = repositories();
  const promptLoader = async (name, version) => {
    calls.prompts.push(`${name}@${version}`);
    return prompt(name, version);
  };
  const respond = (mode, data) => {
    if (mode !== 'success') throw Object.assign(new Error('provider down'), { status: 503 });
    return {
      data,
      provider: 'aicredits',
      model: 'test-model',
      providerRequestId: 'request-1',
      latencyMs: 5,
      usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, totalTokens: 15 },
      attempts: [],
    };
  };
  const resolver = (profile, options) => {
    calls.resolver.push({ profile, ...options });
    const provider = {
      async generateStructured({ input }) {
        const parsed = JSON.parse(input);
        calls.providerInputs.push({ operation: options.operation, parsed });
        if (options.operation === 'combined_preparation' && combined === 'invalid') {
          return respond('success', {
            sourceUnderstanding: understandingData(parsed.sources),
            learnerAssessment: assessmentData('Text that is not in any input'),
          });
        }
        if (options.operation === 'combined_preparation') {
          return respond(combined, {
            sourceUnderstanding: understandingData(parsed.sources),
            learnerAssessment: assessmentData(
              'Built a React dashboard',
              parsed.learner.normalizedInputs.resumeText ? 'resumeText' : 'naturalLanguage',
            ),
          });
        }
        return respond(understanding, understandingData(parsed.sources));
      },
    };
    return {
      configuration: { provider: 'aicredits', model: 'test-model' },
      provider:
        reuseLayer && options.reuse?.scope
          ? reuseLayer.wrap(provider, {
              operation: options.operation,
              scope: options.reuse.scope,
              dataClass: options.dataClass,
              models: ['aicredits:test-model'],
              cacheTtlSeconds: options.reuse.cacheTtlSeconds,
            })
          : provider,
    };
  };
  const sourceUnderstanding = createSourceUnderstandingService({
    registry: registerDefaultSourceHandlers(new SourceHandlerRegistry(), {
      fetcher: async () => {
        throw new Error('network disabled in tests');
      },
      githubToken: null,
      youtubeApiKey: null,
    }),
    providerResolver: resolver,
    promptLoader,
    repositories: storage,
    now: () => fixedNow,
    log: { error() {}, warn() {} },
  });
  const trackedUnderstanding = {
    normalize: sourceUnderstanding.normalize,
    async understandNormalized(args) {
      calls.understand.push({ profile: args.profile, promptVersion: args.promptVersion });
      return sourceUnderstanding.understandNormalized(args);
    },
    async understand(args) {
      calls.understand.push({ legacy: true, sources: args.sources.map(({ type }) => type) });
      return {
        understanding: {
          sourceProcessing: args.sources.map((source) => ({
            sourceType: source.type,
            identifier: null,
            status: 'processed',
            errorCode: null,
          })),
        },
      };
    },
  };
  const service = createPreparationService({
    flags: { isEnabled: async (flag) => flags.includes(flag) },
    sourceUnderstanding: trackedUnderstanding,
    assessment: {
      async assess(args) {
        calls.assess.push({ profile: args.profile ?? 'core', inputs: args.inputs });
        if (assessment === 'quota') {
          throw new AppError('Free AI preparation is temporarily unavailable', {
            status: 503,
            code: 'AI_FREE_PREPARATION_UNAVAILABLE',
          });
        }
        if (assessment !== 'success') {
          throw Object.assign(new Error('failed'), { code: 'AI_PROVIDER_ERROR' });
        }
        return { assessment: { schemaVersion: '1.0.0', currentLevel: 'intermediate' } };
      },
    },
    learningContext: {
      async create(args) {
        calls.contexts.push(args);
        return { contextVersion: 1, fake: true };
      },
    },
    providerResolver: resolver,
    promptLoader,
    repositories: storage,
    failurePolicy,
    log: { info() {}, error() {}, warn() {} },
  });
  return { service, calls, storage };
}

function prepare(service, input, learner = null) {
  return service.prepare({
    ownerId: null,
    requestId: 'request-1',
    pipelineId: '22222222-2222-4222-8222-222222222222',
    learner,
    input: { mode: 'quick', questionnaire: {}, ...input },
  });
}

test('flag off runs the legacy preparation unchanged', async () => {
  const { service, calls } = harness({ flags: [flagNames.assessment] });
  const result = await prepare(service, {
    sources: [{ type: 'natural_prompt', content: goal }, resumeSource],
    assessmentInputs: { naturalLanguage: goal, resumeText: resumeSource.content },
    explicitInput: { primaryGoal: goal },
  });

  assert.equal(result.preparation.pipelineVersion, 'legacy');
  assert.deepEqual(calls.understand, [{ legacy: true, sources: ['natural_prompt', 'resume'] }]);
  assert.deepEqual(
    calls.assess.map(({ profile }) => profile),
    ['core'],
  );
  assert.equal(calls.contexts[0].applyUnknownLevelDefault, false);
  assert.ok(validatePreparation(result.preparation), JSON.stringify(validatePreparation.errors));
});

test('case 1: goal text with a selected level makes no preparatory model call', async () => {
  const { service, calls } = harness();
  const result = await prepare(service, {
    sources: [{ type: 'natural_prompt', content: 'Learn React from scratch' }],
    assessmentInputs: { naturalLanguage: 'Learn React from scratch' },
    explicitInput: { primaryGoal: 'Learn React from scratch', experienceLevel: 'beginner' },
  });

  assert.equal(result.preparation.case, 1);
  assert.deepEqual(result.preparation.executedOperations, []);
  assert.equal(result.preparation.expectedCalls, 1);
  assert.equal(calls.resolver.length, 0);
  assert.equal(calls.assess.length, 0);
  assert.equal(result.sourceUnderstanding, null);
  assert.equal(calls.contexts[0].assessment, null);
  assert.equal(calls.contexts[0].applyUnknownLevelDefault, true);
  assert.equal(result.preparation.degraded, false);
  assert.ok(validatePreparation(result.preparation), JSON.stringify(validatePreparation.errors));
});

test('case 2: a planning source runs source understanding 1.2.0 on the fast profile', async () => {
  const { service, calls } = harness();
  const result = await prepare(service, {
    sources: [{ type: 'natural_prompt', content: goal }, pdfSource],
    assessmentInputs: { naturalLanguage: goal },
    explicitInput: { primaryGoal: goal, experienceLevel: 'intermediate' },
  });

  assert.equal(result.preparation.case, 2);
  assert.deepEqual(calls.understand, [{ profile: 'fast', promptVersion: '1.2.0' }]);
  assert.deepEqual(calls.prompts, ['source-understanding@1.2.0']);
  assert.equal(result.sourceUnderstanding.schemaVersion, '1.2.0');
  assert.equal(calls.assess.length, 0);
  assert.equal(result.sourceUnderstanding.requirements[0].criticality, 'critical');
  assert.deepEqual(
    result.preparation.sourceStatuses.map(
      ({ sourceType, retrievalStatus, understandingStatus }) => [
        sourceType,
        retrievalStatus,
        understandingStatus,
      ],
    ),
    [
      ['natural_prompt', 'not_applicable', 'not_required'],
      ['pdf', 'retrieved', 'understood'],
    ],
  );
  assert.ok(validatePreparation(result.preparation), JSON.stringify(validatePreparation.errors));
});

test('case 3: one combined call, kept on paid models when a resume is present', async () => {
  const { service, calls, storage } = harness();
  const result = await prepare(service, {
    sources: [{ type: 'natural_prompt', content: goal }, pdfSource, resumeSource],
    assessmentInputs: { naturalLanguage: goal, resumeText: resumeSource.content },
    explicitInput: { primaryGoal: goal },
  });

  assert.equal(result.preparation.case, 3);
  assert.deepEqual(result.preparation.executedOperations, ['combined_preparation']);
  assert.deepEqual(calls.resolver, [
    {
      profile: 'fast',
      operation: 'combined_preparation',
      dataClass: 'personal',
      reuse: { scope: null, cacheTtlSeconds: 3_600 },
    },
  ]);
  assert.deepEqual(calls.prompts, ['preparation-combined@1.1.0']);
  const sentSources = calls.providerInputs[0].parsed.sources.map(({ type }) => type);
  assert.ok(!sentSources.includes('resume'), 'resume is learner evidence, not a planning source');
  assert.equal(result.sourceUnderstanding.requirements.length, 1);
  assert.equal(calls.contexts[0].assessment.currentLevel, 'intermediate');
  assert.equal(storage.state.runs[0].operation, 'combined_preparation');
  assert.equal(storage.state.usage[0].outcome, 'success');
  assert.equal(
    result.preparation.sourceStatuses.find(({ sourceType }) => sourceType === 'resume')
      .understandingStatus,
    'understood',
  );
});

test('case 3 failure degrades to source excerpts and the default level', async () => {
  const { service, calls } = harness({ combined: 'fail' });
  const result = await prepare(service, {
    sources: [{ type: 'natural_prompt', content: selfDescription }, pdfSource],
    assessmentInputs: { naturalLanguage: selfDescription },
    explicitInput: { primaryGoal: selfDescription },
  });

  assert.equal(result.preparation.sourceUnderstanding.state, 'FAILED');
  assert.equal(result.preparation.learnerAssessment.state, 'FAILED');
  assert.equal(result.preparation.degraded, true);
  assert.equal(result.preparation.sourceExcerpts[0].sourceType, 'pdf');
  assert.match(result.preparation.sourceExcerpts[0].excerpt, /REST API/);
  assert.equal(calls.contexts[0].assessment, null);
  assert.equal(calls.contexts[0].applyUnknownLevelDefault, true);
  assert.ok(result.preparation.notices.length > 0);
  assert.ok(validatePreparation(result.preparation), JSON.stringify(validatePreparation.errors));
});

test('unsupported evidence in a combined output is accounted as invalid output', async () => {
  const { service, storage } = harness({ combined: 'invalid' });
  const result = await prepare(service, {
    sources: [{ type: 'natural_prompt', content: selfDescription }, pdfSource],
    assessmentInputs: { naturalLanguage: selfDescription },
    explicitInput: { primaryGoal: selfDescription },
  });

  assert.equal(result.preparation.learnerAssessment.errorCode, 'AI_EVIDENCE_VALIDATION_FAILED');
  assert.equal(storage.state.usage.at(-1).outcome, 'invalid_output');
  assert.deepEqual(storage.state.failed, ['AI_EVIDENCE_VALIDATION_FAILED']);
});

test('case 4: learner evidence alone runs assessment on the fast profile', async () => {
  const { service, calls } = harness();
  const result = await prepare(service, {
    sources: [{ type: 'natural_prompt', content: selfDescription }],
    assessmentInputs: { naturalLanguage: selfDescription },
    explicitInput: { primaryGoal: selfDescription },
  });

  assert.equal(result.preparation.case, 4);
  assert.deepEqual(
    calls.assess.map(({ profile }) => profile),
    ['fast'],
  );
  assert.equal(calls.understand.length, 0);
  assert.equal(calls.contexts[0].assessment.currentLevel, 'intermediate');
});

test('case 4 failure keeps generating with the default level', async () => {
  const { service, calls } = harness({ assessment: 'fail' });
  const result = await prepare(service, {
    sources: [{ type: 'natural_prompt', content: selfDescription }],
    assessmentInputs: { naturalLanguage: selfDescription },
    explicitInput: { primaryGoal: selfDescription },
  });

  assert.equal(result.preparation.learnerAssessment.state, 'FAILED');
  assert.equal(result.preparation.learnerAssessment.errorCode, 'LEARNER_ASSESSMENT_FAILED');
  assert.equal(result.preparation.degraded, true);
  assert.equal(calls.contexts[0].assessment, null);
});

const selfDescribedGoal = {
  sources: [{ type: 'natural_prompt', content: selfDescription }],
  assessmentInputs: { naturalLanguage: selfDescription },
  explicitInput: { primaryGoal: selfDescription },
};

test('fail policy: a combined preparation failure stops the request with 502', async () => {
  const { service, calls } = harness({ combined: 'fail', failurePolicy: 'fail' });
  await assert.rejects(
    prepare(service, {
      sources: [{ type: 'natural_prompt', content: selfDescription }, pdfSource],
      assessmentInputs: { naturalLanguage: selfDescription },
      explicitInput: { primaryGoal: selfDescription },
    }),
    (error) =>
      error.status === 502 &&
      error.code === 'AI_PREPARATION_FAILED' &&
      error.details.operation === 'combined_preparation',
  );
  assert.equal(calls.contexts.length, 0, 'no learning context, so no generation');
});

test('fail policy: an assessment failure stops the request with 502', async () => {
  const { service } = harness({ assessment: 'fail', failurePolicy: 'fail' });
  await assert.rejects(prepare(service, selfDescribedGoal), { code: 'AI_PREPARATION_FAILED' });
});

test('fail policy: an exhausted free quota is returned as 503 for the client', async () => {
  const { service } = harness({ assessment: 'quota', failurePolicy: 'fail' });
  await assert.rejects(prepare(service, selfDescribedGoal), {
    status: 503,
    code: 'AI_FREE_PREPARATION_UNAVAILABLE',
  });
});

test('fail policy: an unreachable source is not a model failure and still continues', async () => {
  const { service } = harness({ failurePolicy: 'fail' });
  const result = await prepare(service, {
    sources: [{ type: 'natural_prompt', content: goal }, githubSource],
    assessmentInputs: { naturalLanguage: goal },
    explicitInput: { primaryGoal: goal, experienceLevel: 'beginner' },
  });
  assert.equal(
    result.preparation.sourceUnderstanding.errorCode,
    'ALL_PLANNING_SOURCES_UNAVAILABLE',
  );
});

test('a disabled assessment flag routes learner evidence to insufficient evidence', async () => {
  const { service, calls } = harness({ flags: [flagNames.routed] });
  const result = await prepare(service, {
    sources: [{ type: 'natural_prompt', content: selfDescription }],
    assessmentInputs: { naturalLanguage: selfDescription },
    explicitInput: { primaryGoal: selfDescription },
  });

  assert.equal(result.preparation.learnerAssessment.state, 'INSUFFICIENT_EVIDENCE');
  assert.equal(calls.assess.length, 0);
});

test('unreachable sources are reported per source and the goal text is still used', async () => {
  const { service, calls } = harness();
  const result = await prepare(service, {
    sources: [{ type: 'natural_prompt', content: goal }, githubSource],
    assessmentInputs: { naturalLanguage: goal },
    explicitInput: { primaryGoal: goal, experienceLevel: 'beginner' },
  });

  assert.equal(calls.understand.length, 0, 'no model call when nothing could be retrieved');
  assert.equal(result.preparation.sourceUnderstanding.state, 'FAILED');
  assert.equal(
    result.preparation.sourceUnderstanding.errorCode,
    'ALL_PLANNING_SOURCES_UNAVAILABLE',
  );
  const github = result.preparation.sourceStatuses.find(
    ({ sourceType }) => sourceType === 'github_repository',
  );
  assert.equal(github.retrievalStatus, 'retrieval_failed');
  assert.equal(typeof github.errorCode, 'string');
  assert.equal(result.preparation.degraded, true);
  assert.match(result.preparation.notices[0], /couldn't access/);
  assert.ok(validatePreparation(result.preparation), JSON.stringify(validatePreparation.errors));
});

test('fails clearly when no source can be read and there is no goal text', async () => {
  const { service } = harness();
  await assert.rejects(
    prepare(service, {
      sources: [githubSource],
      assessmentInputs: { naturalLanguage: 'x' },
      explicitInput: { primaryGoal: '' },
    }),
    { code: 'PREPARATION_NO_USABLE_INPUT' },
  );
});

const reuseConfig = Object.freeze({
  dedupEnabled: true,
  resultCacheEnabled: true,
  publicTtlSeconds: 604_800,
  ownerTtlSeconds: 3_600,
});
const learnerA = learnerScope({ anonymousSessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
const learnerB = learnerScope({ anonymousSessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' });

function reuseHarness() {
  const reuseLayer = createReuseLayer({
    store: createAiResultStore({ redisReady: () => false }),
    config: reuseConfig,
    log: { warn() {} },
  });
  return harness({ reuseLayer });
}

/**
 * Provider calls per RFC 0001 preparation case, with caching on: the first request, a repeat by
 * the same learner, and the same input from a different learner.
 */
const caseInputs = {
  1: {
    sources: [{ type: 'natural_prompt', content: 'Learn React from scratch' }],
    assessmentInputs: { naturalLanguage: 'Learn React from scratch' },
    explicitInput: { primaryGoal: 'Learn React from scratch', experienceLevel: 'beginner' },
  },
  2: {
    sources: [{ type: 'natural_prompt', content: goal }, pdfSource],
    assessmentInputs: { naturalLanguage: goal },
    explicitInput: { primaryGoal: goal, experienceLevel: 'intermediate' },
  },
  3: {
    sources: [{ type: 'natural_prompt', content: goal }, pdfSource, resumeSource],
    assessmentInputs: { naturalLanguage: goal, resumeText: resumeSource.content },
    explicitInput: { primaryGoal: goal },
  },
};

for (const [caseNumber, expected] of [
  ['1', { first: 0, repeat: 0, otherLearner: 0 }],
  ['2', { first: 1, repeat: 0, otherLearner: 1 }],
  ['3', { first: 1, repeat: 0, otherLearner: 1 }],
]) {
  test(`case ${caseNumber} request count: first ${expected.first}, same-learner repeat ${expected.repeat}, other learner ${expected.otherLearner}`, async () => {
    const { service, calls, storage } = reuseHarness();
    const counted = () => calls.providerInputs.length;

    const first = await prepare(service, caseInputs[caseNumber], learnerA);
    const afterFirst = counted();
    const repeat = await prepare(service, caseInputs[caseNumber], learnerA);
    const afterRepeat = counted();
    await prepare(service, caseInputs[caseNumber], learnerB);

    assert.equal(first.preparation.case, Number(caseNumber));
    assert.equal(afterFirst, expected.first, 'first request');
    assert.equal(afterRepeat - afterFirst, expected.repeat, 'repeat by the same learner');
    assert.equal(counted() - afterRepeat, expected.otherLearner, 'same input, other learner');
    assert.equal(repeat.sourceUnderstanding?.summary, first.sourceUnderstanding?.summary);
    if (repeat.sourceUnderstanding) {
      const currentIds = new Set(
        repeat.sourceUnderstanding.sourceAttributions.map(({ sourceId }) => sourceId),
      );
      for (const evidence of repeat.sourceUnderstanding.evidence) {
        assert.ok(currentIds.has(evidence.sourceId), 'reused evidence cites this request');
      }
    }
    if (expected.first > 0) {
      const reused = storage.state.usage.filter((record) => record.reuseOutcome === 'cache_hit');
      assert.equal(reused.length, 1, 'the repeat is recorded as a cache hit');
      assert.equal(reused[0].totalTokens, 0);
    }
  });
}

test('without a learner scope, every repeat is a new provider call', async () => {
  const { service, calls } = reuseHarness();
  await prepare(service, caseInputs[2]);
  await prepare(service, caseInputs[2]);
  assert.equal(calls.providerInputs.length, 2);
});

test('learner assessment uses prompt 1.1.0 for preparation and keeps 1.0.0 for the legacy profile', async () => {
  const loaded = [];
  const service = createAssessmentService({
    flags: { isEnabled: async () => true },
    providerResolver: () => ({
      configuration: { provider: 'aicredits', model: 'test-model' },
      provider: {
        async generateStructured() {
          return {
            data: assessmentData('Built a React dashboard'),
            provider: 'aicredits',
            model: 'test-model',
            latencyMs: 5,
            usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, totalTokens: 15 },
          };
        },
      },
    }),
    promptLoader: async (name, version) => {
      loaded.push(`${name}@${version}`);
      return prompt(name, version);
    },
    repositories: repositories(),
    log: { error() {}, warn() {} },
  });
  const assess = (profile) =>
    service.assess({
      ownerId: null,
      requestId: 'request-1',
      inputs: { naturalLanguage: selfDescription },
      ...(profile ? { profile } : {}),
    });

  await assess('fast');
  await assess();
  assert.deepEqual(loaded, ['learner-assessment@1.1.0', 'learner-assessment@1.0.0']);
});

test('the preparation prompts keep the untrusted-data rule and never cap requirements', async () => {
  const { loadPrompt } = await import('../src/modules/ai/prompt.repository.js');
  for (const [name, version] of [
    ['source-understanding', '1.2.0'],
    ['preparation-combined', '1.1.0'],
    ['learner-assessment', '1.1.0'],
  ]) {
    const { content } = await loadPrompt(name, version);
    assert.match(content, /untrusted data/, `${name}@${version} keeps the injection rule`);
    if (name !== 'learner-assessment') {
      assert.match(content, /Requirements are never limited/, `${name}@${version}`);
    }
  }
});

test('case 4 request count: first 1, same-learner repeat 0, other learner 1', async () => {
  const reuseLayer = createReuseLayer({
    store: createAiResultStore({ redisReady: () => false }),
    config: reuseConfig,
    log: { warn() {} },
  });
  const storage = repositories();
  let providerCalls = 0;
  const provider = {
    async generateStructured() {
      providerCalls += 1;
      return {
        data: assessmentData('Built a React dashboard'),
        provider: 'aicredits',
        model: 'test-model',
        latencyMs: 5,
        usage: { inputTokens: 10, cachedInputTokens: 0, outputTokens: 5, totalTokens: 15 },
      };
    },
  };
  const service = createAssessmentService({
    flags: { isEnabled: async () => true },
    providerResolver: (_profile, options) => ({
      configuration: { provider: 'aicredits', model: 'test-model' },
      provider: reuseLayer.wrap(provider, {
        operation: options.operation,
        scope: options.reuse.scope,
        dataClass: options.dataClass,
        models: ['aicredits:test-model'],
        cacheTtlSeconds: options.reuse.cacheTtlSeconds,
      }),
    }),
    promptLoader: async (name, version) => prompt(name, version),
    repositories: storage,
    log: { error() {}, warn() {} },
  });
  const assess = (learner) =>
    service.assess({
      ownerId: null,
      requestId: 'request-1',
      inputs: { naturalLanguage: selfDescription },
      profile: 'fast',
      learner,
    });

  const first = await assess(learnerA);
  await assess(learnerA);
  assert.equal(providerCalls, 1);
  await assess(learnerB);
  assert.equal(providerCalls, 2);
  assert.equal(first.assessment.currentLevel, 'intermediate');
  assert.equal(
    storage.state.usage.filter((record) => record.reuseOutcome === 'cache_hit').length,
    1,
  );
});
