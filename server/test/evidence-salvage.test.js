import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyEvidenceRepair,
  EVIDENCE_REPAIR_STAGE,
  repairRequirementEvidence,
} from '../src/modules/ai/evidence/repair.js';
import {
  salvageAndValidateAssessment,
  salvageAssessmentEvidence,
  salvageSourceEvidence,
} from '../src/modules/ai/evidence/salvage.js';
import { normalizeRequirementCriticality } from '../src/modules/ai/source-understanding/source-understanding.validator.js';

const sourceId = '33333333-3333-4333-8333-333333333333';
const readme = [
  '# Inventory Service',
  '- Authenticate every request with JWT bearer tokens.',
  '- Store data in PostgreSQL and manage the schema with migrations.',
  '- The whole service starts with `docker compose up`.',
].join('\n');
const sources = [{ sourceId, content: readme }];

function insight(name, evidenceIds) {
  return { name, confidence: 0.9, evidenceIds, reasoning: `${name} is in the README.` };
}

function requirement(id, statement, evidenceIds, kind = 'requirement') {
  return { id, statement, kind, origin: 'source_fact', criticality: 'critical', evidenceIds };
}

function understanding({ secondExcerpt = 'Store data in PostgreSQL using migrations.' } = {}) {
  const excerpts = [
    'Authenticate every request with JWT bearer tokens.',
    secondExcerpt,
    'The whole service starts with `docker compose up`.',
  ];
  return {
    concepts: [insight('JWT authentication', ['E1']), insight('Database migrations', ['E2'])],
    technologies: [insight('PostgreSQL', ['E2', 'E1'])],
    skills: [],
    prerequisites: [],
    milestones: [],
    creatorRecommendations: [],
    dependencies: [],
    preservedStructure: [],
    assumptions: [],
    evidence: excerpts.map((excerpt, index) => ({
      evidenceId: `E${index + 1}`,
      sourceId,
      locator: 'README',
      excerpt,
    })),
    requirements: [
      requirement('R1', 'Use JWT authentication', ['E1']),
      requirement('R2', 'Use PostgreSQL with migrations', ['E2']),
      requirement('R3', 'Starts with docker compose', ['E3'], 'evaluation_criterion'),
    ],
  };
}

test('F4 example: a reworded quote is dropped with what rests only on it; R2 is demoted, not removed', () => {
  const { understanding: salvaged, report } = salvageSourceEvidence(understanding(), sources);

  assert.deepEqual(
    salvaged.evidence.map(({ evidenceId }) => evidenceId),
    ['E1', 'E3'],
  );
  assert.deepEqual(
    salvaged.concepts.map(({ name }) => name),
    ['JWT authentication'],
  );
  assert.deepEqual(salvaged.technologies[0].evidenceIds, ['E1']);
  assert.deepEqual(report, {
    droppedEvidence: 1,
    droppedItems: 1,
    demotedRequirements: ['R2'],
    repairedRequirements: [],
  });

  const normalized = normalizeRequirementCriticality(salvaged);
  assert.deepEqual(
    normalized.requirements.map(({ id, origin, criticality }) => [id, origin, criticality]),
    [
      ['R1', 'source_fact', 'critical'],
      ['R2', 'inference', 'noncritical'],
      ['R3', 'source_fact', 'critical'],
    ],
  );
});

test('a fully grounded output is unchanged and has no report', () => {
  const clean = understanding({
    secondExcerpt: 'Store data in PostgreSQL and manage the schema with migrations.',
  });
  const result = salvageSourceEvidence(clean, sources);
  assert.equal(result.report, null);
  assert.deepEqual(result.understanding.requirements, clean.requirements);
});

test('an output with less than half of its evidence grounded is rejected, not salvaged', () => {
  const output = understanding();
  output.evidence[0].excerpt = 'Authenticate requests using JWT.';
  assert.equal(salvageSourceEvidence(output, sources), null);
});

test('references to evidence that does not exist are removed', () => {
  const output = understanding({
    secondExcerpt: 'Store data in PostgreSQL and manage the schema with migrations.',
  });
  output.concepts[0].evidenceIds = ['E1', 'E9'];
  const { understanding: salvaged, report } = salvageSourceEvidence(output, sources);
  assert.deepEqual(salvaged.concepts[0].evidenceIds, ['E1']);
  assert.equal(report.droppedEvidence, 0);
});

const goal =
  "I'm a data analyst with 2 years of SQL and Excel experience and I want to learn machine learning";
const absent = { inferred: false, value: null, confidence: 0, reasoning: 'None.', evidence: [] };

function assessment({ proficiencyExcerpt = 'data analyst' } = {}) {
  const skill = (name, excerpt) => ({
    name,
    category: 'data',
    confidence: 0.8,
    reasoning: `${name} is stated.`,
    evidence: [{ source: 'naturalLanguage', excerpt }],
  });
  return {
    schemaVersion: '1.0.0',
    currentLevel: 'beginner',
    confidence: 0.7,
    reasoning: 'Analyst experience, new to machine learning.',
    proficiencyEvidence: [{ source: 'naturalLanguage', excerpt: proficiencyExcerpt }],
    knownSkills: [skill('SQL', '2 years of SQL experience'), skill('Excel', 'Excel experience')],
    missingSkills: [skill('Machine learning', 'I want to learn machine learning')],
    suggestedSkills: [],
    experienceSignals: [],
    educationSignals: [],
    technologyStack: [],
    careerDirection: { ...absent, value: 'Machine learning', confidence: 0.6 },
    projectComplexity: absent,
    experienceSummary: absent,
    educationSummary: absent,
    technologySummary: absent,
    clarificationRequired: false,
  };
}

test('F9 example: a reworded learner quote drops the skill it supported; inconsistent inferences become not inferred', () => {
  const { assessment: salvaged, report } = salvageAssessmentEvidence(assessment(), {
    naturalLanguage: goal,
  });
  assert.deepEqual(
    salvaged.knownSkills.map(({ name }) => name),
    ['Excel'],
  );
  assert.deepEqual(salvaged.careerDirection, { ...absent, reasoning: 'None.' });
  assert.equal(report.droppedEvidence, 1);
  assert.equal(report.droppedItems, 2);
});

test('an assessment with no grounded proficiency evidence still fails', () => {
  assert.throws(
    () =>
      salvageAndValidateAssessment(assessment({ proficiencyExcerpt: 'senior ML engineer' }), {
        naturalLanguage: goal,
      }),
    (error) => error.code === 'AI_EVIDENCE_VALIDATION_FAILED',
  );
});

test('a repaired quote must be exact, long enough and from the named source', () => {
  const { understanding: salvaged } = salvageSourceEvidence(understanding(), sources);
  const quotes = [
    { requirementId: 'R2', sourceId, excerpt: 'PostgreSQL' },
    { requirementId: 'R2', sourceId, excerpt: 'Store data in Postgres with migrations' },
    {
      requirementId: 'R2',
      sourceId,
      excerpt: 'Store data in PostgreSQL and manage the schema with migrations.',
    },
  ];
  const { understanding: repaired, repaired: ids } = applyEvidenceRepair(
    salvaged,
    ['R2'],
    quotes,
    sources,
  );
  assert.deepEqual(ids, ['R2']);
  const requirementTwo = normalizeRequirementCriticality(repaired).requirements[1];
  assert.equal(requirementTwo.criticality, 'critical');
  assert.equal(requirementTwo.origin, 'source_fact');
  assert.equal(repaired.evidence.at(-1).excerpt, quotes[2].excerpt);
});

function repairHarness(respond) {
  const usage = [];
  const requests = [];
  const salvage = salvageSourceEvidence(understanding(), sources);
  const finalized = {
    understanding: normalizeRequirementCriticality(salvage.understanding),
    salvaged: salvage.understanding,
    report: salvage.report,
  };
  const run = () =>
    repairRequirementEvidence({
      finalized,
      sources,
      reuseHints: { stableSources: [], ids: [sourceId] },
      provider: {
        async generateStructured(request) {
          requests.push(request);
          return respond(request);
        },
      },
      configuration: { provider: 'aicredits', model: 'test-model' },
      promptLoader: async (name, version) => ({ name, version, hash: 'h', content: 'Repair.' }),
      repositories: { prompts: { async ensure() {} } },
      recordUsage: async (fields) => usage.push(fields),
      metadata: { run_id: 'run-1' },
      timeoutMs: 1_000,
      log: { warn() {}, error() {} },
    });
  return { run, usage, requests, finalized };
}

test('one repair call restores a demoted critical requirement and is recorded as its own stage', async () => {
  const { run, usage, requests } = repairHarness(() => ({
    data: {
      quotes: [
        {
          requirementId: 'R2',
          sourceId,
          excerpt: 'Store data in PostgreSQL and manage the schema with migrations.',
        },
      ],
    },
  }));
  const result = await run();

  assert.equal(requests.length, 1);
  assert.deepEqual(JSON.parse(requests[0].input).requirements, [
    { id: 'R2', statement: 'Use PostgreSQL with migrations', kind: 'requirement' },
  ]);
  assert.equal(result.understanding.requirements[1].criticality, 'critical');
  assert.deepEqual(result.report.demotedRequirements, []);
  assert.deepEqual(result.report.repairedRequirements, ['R2']);
  assert.equal(usage.length, 1);
  assert.equal(usage[0].stage, EVIDENCE_REPAIR_STAGE);
  assert.equal(usage[0].prompt.name, 'evidence-repair');
});

test('a failed or unusable repair keeps the salvaged result', async () => {
  const failing = repairHarness(() => {
    throw Object.assign(new Error('timeout'), { code: 'AI_PROVIDER_TIMEOUT' });
  });
  const failed = await failing.run();
  assert.equal(failed, failing.finalized);
  assert.equal(failing.usage[0].outcome, 'provider_error');

  const paraphrasing = repairHarness(() => ({
    data: { quotes: [{ requirementId: 'R2', sourceId, excerpt: 'Use Postgres and migrations' }] },
  }));
  const kept = await paraphrasing.run();
  assert.equal(kept, paraphrasing.finalized);
  assert.deepEqual(kept.report.demotedRequirements, ['R2']);
});

test('no repair call is made when no critical requirement lost its evidence', async () => {
  let calls = 0;
  const finalized = { understanding: {}, salvaged: {}, report: null };
  const result = await repairRequirementEvidence({
    finalized,
    provider: {
      async generateStructured() {
        calls += 1;
      },
    },
  });
  assert.equal(result, finalized);
  assert.equal(calls, 0);
});
