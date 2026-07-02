import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAiOutput } from '../src/modules/ai/json.validator.js';
import { createAssessmentService } from '../src/modules/ai/assessment/assessment.service.js';
import { validateAssessmentEvidence } from '../src/modules/ai/assessment/assessment.validator.js';
import { prepareAssessmentInputs } from '../src/modules/ai/assessment/deterministic-signal.extractor.js';
import { finalizeProficiencyAssessment } from '../src/modules/ai/assessment/proficiency.analyzer.js';

function evidence(source, excerpt) {
  return { source, excerpt };
}

function optionalInference({ source, excerpt, value }) {
  if (value == null) {
    return {
      inferred: false,
      value: null,
      confidence: 0,
      reasoning: 'No supporting evidence was provided.',
      evidence: [],
    };
  }

  return {
    inferred: true,
    value,
    confidence: 0.85,
    reasoning: 'The supplied input directly supports this inference.',
    evidence: [evidence(source, excerpt)],
  };
}

function skill({ source, excerpt, name = 'React', category = 'programming' }) {
  return {
    name,
    category,
    confidence: 0.9,
    reasoning: 'The learner explicitly described using this skill.',
    evidence: [evidence(source, excerpt)],
  };
}

function validAssessment({ source = 'naturalLanguage', excerpt = 'Built a React dashboard' } = {}) {
  return {
    schemaVersion: '1.0.0',
    currentLevel: 'intermediate',
    confidence: 0.82,
    reasoning: 'The learner demonstrates applied project experience with a relevant technology.',
    proficiencyEvidence: [evidence(source, excerpt)],
    knownSkills: [skill({ source, excerpt })],
    missingSkills: [skill({ source, excerpt, name: 'Testing', category: 'testing' })],
    suggestedSkills: [],
    experienceSignals: [
      {
        value: 'Applied project experience',
        confidence: 0.85,
        reasoning: 'The learner described a completed dashboard.',
        evidence: [evidence(source, excerpt)],
      },
    ],
    educationSignals: [],
    technologyStack: [skill({ source, excerpt })],
    careerDirection: optionalInference({
      source,
      excerpt,
      value: 'Frontend development',
    }),
    projectComplexity: optionalInference({ source, excerpt, value: 'moderate' }),
    experienceSummary: optionalInference({
      source,
      excerpt,
      value: 'Has applied React in a dashboard project.',
    }),
    educationSummary: optionalInference({}),
    technologySummary: optionalInference({
      source,
      excerpt,
      value: 'Demonstrated React experience.',
    }),
    clarificationRequired: false,
  };
}

function createRepositories(events) {
  return {
    prompts: { ensure: async () => events.push('prompt') },
    runs: {
      create: async (data) => events.push({ create: data }),
      complete: async (runId) => events.push({ complete: runId }),
      fail: async (runId, error) => events.push({ fail: runId, code: error.code }),
    },
    usage: { record: async (data) => events.push({ usage: data }) },
  };
}

function createService({ assessment, providerError, threshold = 0.65, events = [] }) {
  return createAssessmentService({
    log: { error() {} },
    flags: { isEnabled: async () => true },
    confidenceThreshold: threshold,
    promptLoader: async () => ({
      name: 'learner-assessment',
      version: '1.0.0',
      hash: 'a'.repeat(64),
      content: 'Assess the learner.',
    }),
    providerResolver: () => ({
      configuration: { provider: 'openai', model: 'configured-model' },
      provider: {
        async generateStructured(request) {
          events.push({ request });
          if (providerError) throw providerError;
          return {
            data: assessment,
            provider: 'openai',
            model: 'configured-model',
            providerRequestId: 'provider-request',
            latencyMs: 12,
            usage: {
              inputTokens: 20,
              cachedInputTokens: 0,
              outputTokens: 30,
              reasoningTokens: 0,
              totalTokens: 50,
            },
          };
        },
      },
    }),
    repositories: createRepositories(events),
  });
}

test('deterministic preparation redacts contact details and extracts technology signals', () => {
  const prepared = prepareAssessmentInputs({
    resumeText: [
      'Email ada@example.com or +91 98765 43210.',
      'Frontend Engineer, January 2021 - Present',
      'Built React systems with 3 years of experience.',
      'Bachelor of Technology, Example University',
    ].join('\n'),
  });

  assert.doesNotMatch(prepared.inputs.resumeText, /ada@example\.com/);
  assert.doesNotMatch(prepared.inputs.resumeText, /98765 43210/);
  assert.match(prepared.inputs.resumeText, /EMAIL_REDACTED/);
  assert.deepEqual(prepared.deterministicSignals.technologies, ['React']);
  assert.deepEqual(prepared.deterministicSignals.contactSignals, {
    emailCount: 1,
    phoneCount: 1,
  });
  assert.deepEqual(prepared.deterministicSignals.dates, ['January 2021']);
  assert.deepEqual(prepared.deterministicSignals.yearsMentioned, ['2021']);
  assert.deepEqual(prepared.deterministicSignals.experienceStatements, ['3 years of experience']);
  assert.deepEqual(prepared.deterministicSignals.yearsOfExperience, [
    { years: 3, statement: '3 years of experience' },
  ]);
  assert.deepEqual(prepared.deterministicSignals.jobTitles, ['Frontend Engineer']);
  assert.deepEqual(prepared.deterministicSignals.educationEntries, [
    'Bachelor of Technology, Example University',
  ]);
  assert.ok(
    prepared.deterministicSignals.experienceEntries.includes(
      'Frontend Engineer, January 2021 - Present',
    ),
  );
});

test('learner assessment schema and evidence validation accept supported inferences', () => {
  const assessment = validAssessment();
  validateAiOutput('learnerAssessment', assessment);
  assert.equal(
    validateAssessmentEvidence(assessment, {
      naturalLanguage: 'I want a frontend role. Built a React dashboard for an internship.',
    }),
    assessment,
  );
});

test('evidence validation rejects unsupported excerpts', () => {
  const assessment = validAssessment({ excerpt: 'Invented evidence' });

  assert.throws(
    () =>
      validateAssessmentEvidence(assessment, {
        naturalLanguage: 'Built a React dashboard.',
      }),
    (error) => error.code === 'AI_EVIDENCE_VALIDATION_FAILED',
  );
});

test('configured confidence policy deterministically controls clarification requirement', () => {
  assert.equal(
    finalizeProficiencyAssessment({ ...validAssessment(), confidence: 0.64 }, 0.65)
      .clarificationRequired,
    true,
  );
  assert.equal(
    finalizeProficiencyAssessment(
      { ...validAssessment(), confidence: 0.9, clarificationRequired: true },
      0.65,
    ).clarificationRequired,
    false,
  );
});

for (const testCase of [
  {
    name: 'natural-language goal',
    source: 'naturalLanguage',
    inputs: { naturalLanguage: 'I want a frontend role. Built a React dashboard.' },
  },
  {
    name: 'project description',
    source: 'projectDescription',
    inputs: { projectDescription: 'Built a React dashboard for inventory analytics.' },
  },
  {
    name: 'resume text',
    source: 'resumeText',
    inputs: { resumeText: 'Built a React dashboard during a frontend internship.' },
  },
]) {
  test(`assessment service analyzes ${testCase.name} without roadmap output`, async () => {
    const events = [];
    const service = createService({
      events,
      assessment: validAssessment({
        source: testCase.source,
        excerpt: 'Built a React dashboard',
      }),
    });

    const result = await service.assess({
      ownerId: '507f1f77bcf86cd799439011',
      requestId: 'request-id',
      inputs: testCase.inputs,
    });

    assert.equal(result.assessment.currentLevel, 'intermediate');
    assert.equal('phases' in result.assessment, false);
    assert.ok(result.runId);
    assert.ok(events.some((event) => event.usage?.outcome === 'success'));
    assert.ok(events.some((event) => event.complete));
  });
}

test('combined inputs are analyzed in one evidence-grounded provider request', async () => {
  const events = [];
  const service = createService({
    events,
    assessment: validAssessment({ source: 'resumeText' }),
  });

  await service.assess({
    ownerId: '507f1f77bcf86cd799439011',
    requestId: 'request-id',
    inputs: {
      naturalLanguage: 'I want a frontend role.',
      projectDescription: 'Create an analytics application.',
      resumeText: 'Built a React dashboard for analytics.',
    },
  });

  const createEvent = events.find((event) => event.create);
  const providerEvent = events.find((event) => event.request);
  assert.equal(createEvent.create.inputType, 'combined');
  assert.match(providerEvent.request.input, /naturalLanguage/);
  assert.match(providerEvent.request.input, /projectDescription/);
  assert.match(providerEvent.request.input, /resumeText/);
});

test('invalid provider output is rejected, accounted, and marks the run failed', async () => {
  const events = [];
  const service = createService({ events, assessment: { currentLevel: 'expert' } });

  await assert.rejects(
    () =>
      service.assess({
        ownerId: '507f1f77bcf86cd799439011',
        requestId: 'request-id',
        inputs: { naturalLanguage: 'Built a React dashboard.' },
      }),
    (error) => error.code === 'AI_SCHEMA_VALIDATION_FAILED',
  );
  assert.ok(events.some((event) => event.usage?.outcome === 'invalid_output'));
  assert.ok(events.some((event) => event.code === 'AI_SCHEMA_VALIDATION_FAILED'));
});

test('provider failures return a safe error and record the failed attempt', async () => {
  const events = [];
  const service = createService({
    events,
    assessment: null,
    providerError: new Error('secret provider detail'),
  });

  await assert.rejects(
    () =>
      service.assess({
        ownerId: '507f1f77bcf86cd799439011',
        requestId: 'request-id',
        inputs: { naturalLanguage: 'Built a React dashboard.' },
      }),
    (error) => error.code === 'AI_PROVIDER_ERROR' && !error.message.includes('secret'),
  );
  assert.ok(events.some((event) => event.usage?.outcome === 'provider_error'));
  assert.ok(events.some((event) => event.code === 'AI_PROVIDER_ERROR'));
});
