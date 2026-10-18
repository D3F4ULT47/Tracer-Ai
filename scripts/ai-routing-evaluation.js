#!/usr/bin/env node
/**
 * Preparation-only evaluation (RFC 0001 sections 5.1 and 9.4, Plan 0002 task T-07).
 *
 * Runs the routed preparation pipeline on the synthetic fixtures in
 * `evaluation/routing/fixtures.json` against exactly one model and records, per run, the router
 * decision, the parsed output, every provider attempt (tokens, cost, latency) and the scores.
 *
 *   node scripts/ai-routing-evaluation.js --model=openrouter:nvidia/nemotron-3-super-120b-a12b:free
 *   node scripts/ai-routing-evaluation.js --model=aicredits-chat:openai/gpt-oss-120b \
 *     --evaluation=<id> --fixtures=F6,F8 --allow-paid
 *
 * Options:
 *   --model=provider:model   single chain entry used for the `fast` profile (required)
 *   --evaluation=<id>        add to or resume an existing evaluation; runs already recorded are skipped
 *   --fixtures=F4,F5         subset of fixtures (default: all)
 *   --runs=3                 runs per fixture (case 1 fixtures call no model and run once)
 *   --retries=0              provider retries per attempt; 0 measures first-attempt reliability
 *   --max-requests=30        stop before this many provider requests are made by this invocation
 *   --free-timeout=<ms>      override AI_FREE_ATTEMPT_TIMEOUT_MS for this evaluation (recorded in settings)
 *   --allow-paid             required for a paid entry; without it the script makes no paid call
 *
 * Personal-data fixtures (resumes) are skipped for free endpoints (decision D-1). GitHub sources are
 * served from the fixture file by a local fetcher, so nothing is fetched from github.com. Requests
 * are made without a learner scope, so the reuse cache is never consulted. The script never writes
 * review ratings: it writes a blank R1 template that the owner completes.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const paths = {
  fixtures: `${root}evaluation/routing/fixtures.json`,
  runs: `${root}evaluation/routing/runs`,
  reviews: `${root}evaluation/routing/reviews`,
};

const args = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const [key, ...rest] = argument.replace(/^--/, '').split('=');
    return [key, rest.length ? rest.join('=') : 'true'];
  }),
);
if (!args.model || !args.model.includes(':')) {
  console.error('Usage: node scripts/ai-routing-evaluation.js --model=provider:model [options]');
  process.exit(2);
}
const runsPerFixture = Number(args.runs ?? 3);
const maxRequests = Number(args['max-requests'] ?? 30);

process.env.AI_MODEL_FAST = args.model;
process.env.AI_MAX_RETRIES_FAST = String(Number(args.retries ?? 0));
process.env.AI_PREPARATION_FAILURE_POLICY = 'fail';
if (args['free-timeout']) {
  process.env.AI_FREE_ATTEMPT_TIMEOUT_MS = args['free-timeout'];
  process.env.AI_FREE_PREPARATION_BUDGET_MS = String(
    Math.max(
      Number(args['free-timeout']),
      Number(process.env.AI_FREE_PREPARATION_BUDGET_MS ?? 60_000),
    ),
  );
}

const [
  { default: mongoose },
  { connectMongo },
  { aiConfig },
  { createPreparationService },
  { createSourceUnderstandingService },
  { SourceHandlerRegistry },
  { registerDefaultSourceHandlers },
  { learningContextService },
  { AiUsageRecord },
  { createAssessmentService },
  { getConfiguredAiProvider },
] = await Promise.all([
  import('mongoose'),
  import('../server/src/infrastructure/database/mongo.js'),
  import('../server/src/modules/ai/ai.config.js'),
  import('../server/src/modules/ai/preparation/preparation.service.js'),
  import('../server/src/modules/ai/source-understanding/source-understanding.service.js'),
  import('../server/src/modules/ai/source-understanding/source-handler.registry.js'),
  import('../server/src/modules/ai/source-understanding/source.handlers.js'),
  import('../server/src/modules/ai/learning-context/learning-context.service.js'),
  import('../server/src/modules/ai/models/ai-usage-record.model.js'),
  import('../server/src/modules/ai/assessment/assessment.service.js'),
  import('../server/src/modules/ai/providers/provider.factory.js'),
]);

const fastChain = aiConfig.modelChains.fast;
const [entry] = fastChain;
if (fastChain.length !== 1 || `${entry.provider}:${entry.model}` !== args.model) {
  console.error('The fast chain did not resolve to the requested single entry; aborting.');
  process.exit(2);
}
const adapter = ['aicredits', 'openai'].includes(entry.provider) ? 'responses' : 'chat';
const isFree = entry.endpointClass === 'free';
if (!isFree && args['allow-paid'] !== 'true') {
  console.error('This entry is paid. Track 1 makes no paid calls unless --allow-paid is given.');
  process.exit(2);
}

const fixtureFile = JSON.parse(readFileSync(paths.fixtures, 'utf8'));
const wanted = args.fixtures ? new Set(args.fixtures.split(',')) : null;
const fixtures = fixtureFile.fixtures.filter((fixture) => !wanted || wanted.has(fixture.id));

function jsonResponse(status, body) {
  return {
    ok: status < 400,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

function fixtureFetcher(repositories) {
  return async (url) => {
    const match = String(url).match(
      /^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/?]+)(\/[^?]*)?/,
    );
    const repository = match && repositories[match[1]];
    if (!repository) return jsonResponse(404, { message: 'Not Found' });
    const [owner, name] = match[1].split('/');
    const path = match[2] ?? '';
    if (path === '') {
      return jsonResponse(200, {
        name,
        full_name: match[1],
        description: repository.description,
        html_url: `https://github.com/${match[1]}`,
        default_branch: 'main',
        owner: { login: owner },
      });
    }
    if (path === '/languages') return jsonResponse(200, repository.languages);
    if (path === '/readme') {
      return jsonResponse(200, {
        encoding: 'base64',
        content: Buffer.from(repository.readme).toString('base64'),
      });
    }
    if (path.startsWith('/git/trees/')) {
      return jsonResponse(200, {
        tree: repository.paths.map((item) => ({ path: item, type: 'blob' })),
      });
    }
    return jsonResponse(404, { message: 'Not Found' });
  };
}

const captured = {};
const capturingResolver = (...resolverArgs) => {
  const resolved = getConfiguredAiProvider(...resolverArgs);
  return {
    ...resolved,
    provider: {
      ...resolved.provider,
      async generateStructured(request) {
        try {
          return await resolved.provider.generateStructured(request);
        } catch (error) {
          captured.failures.push({
            code: error.code ?? null,
            details: error.details ?? null,
            attempts: (error.aiAttempts ?? []).map(
              (attempt) => attempt.errorCode ?? attempt.outcome ?? null,
            ),
          });
          throw error;
        }
      },
    },
  };
};
const capturingLearningContext = {
  ...learningContextService,
  async create(options) {
    captured.assessment = options.assessment ?? null;
    return learningContextService.create(options);
  },
};
const registry = registerDefaultSourceHandlers(new SourceHandlerRegistry(), {
  fetcher: fixtureFetcher(fixtureFile.repositories),
  githubToken: null,
});
const service = createPreparationService({
  flags: { isEnabled: async () => true },
  sourceUnderstanding: createSourceUnderstandingService({
    registry,
    providerResolver: capturingResolver,
  }),
  assessment: createAssessmentService({ providerResolver: capturingResolver }),
  providerResolver: capturingResolver,
  learningContext: capturingLearningContext,
  failurePolicy: 'fail',
});

const operationFor = {
  1: null,
  2: 'source_understanding',
  3: 'combined_preparation',
  4: 'learner_assessment',
};

function failureClass(error) {
  if (!error) return null;
  const code = error.details?.errorCode ?? error.code ?? '';
  if (/EVIDENCE/.test(code)) return 'evidence';
  if (/SCHEMA|STRUCTURE|INVALID_JSON/.test(code)) return 'schema';
  return 'availability';
}

function scoreRequirements(expected, understanding) {
  const requirements = understanding?.requirements ?? [];
  const score = (labels) =>
    labels.map(({ label, match }) => {
      const patterns = match.map((pattern) => new RegExp(pattern, 'i'));
      const found = requirements.find((requirement) =>
        patterns.some((pattern) => pattern.test(requirement.statement)),
      );
      return { label, found: Boolean(found), criticality: found?.criticality ?? null };
    });
  return {
    critical: score(expected.criticalRequirements ?? []),
    noncritical: score(expected.noncriticalRequirements ?? []),
    allMarkedNoncritical:
      requirements.length > 0 &&
      requirements.every(({ criticality }) => criticality !== 'critical'),
  };
}

function contextOf(result) {
  return result?.context?.context ?? result?.context ?? null;
}

async function runOnce(fixture, run) {
  const pipelineId = randomUUID();
  captured.assessment = null;
  captured.failures = [];
  const startedAt = Date.now();
  let result = null;
  let error = null;
  try {
    result = await service.prepare({
      ownerId: null,
      requestId: `routing-eval-${fixture.id}-${run}`,
      pipelineId,
      input: { mode: 'quick', questionnaire: {}, ...structuredClone(fixture.input) },
      learner: null,
    });
  } catch (caught) {
    error = caught;
  }
  const elapsedMs = Date.now() - startedAt;
  const attempts = await AiUsageRecord.find({ pipelineId }).sort({ createdAt: 1 }).lean();
  const proficiency = contextOf(result)?.currentProficiency ?? null;
  const assessment = captured.assessment;
  const levels = fixture.expected.levels ?? [];
  const resolvedLevel = proficiency?.status === 'resolved' ? proficiency.value : null;
  return {
    fixture: fixture.id,
    run,
    model: args.model,
    adapter,
    endpointClass: entry.endpointClass,
    pipelineId,
    elapsedMs,
    outcome: error ? 'failed' : 'succeeded',
    failureClass: failureClass(error),
    errorCode: error ? (error.details?.errorCode ?? error.code ?? 'UNKNOWN') : null,
    errorMessage: error
      ? [error.message, error.cause?.message, error.details?.providerMessage]
          .filter(Boolean)
          .join(' | ')
          .replace(/(sk-|Bearer\s+)[\w-]+/g, '$1<redacted>')
          .slice(0, 500)
      : null,
    failureDetails: captured.failures,
    router: result
      ? {
          case: result.preparation.case,
          caseMatches: result.preparation.case === fixture.expected.case,
          sourceUnderstanding: result.preparation.sourceUnderstanding.state,
          learnerAssessment: result.preparation.learnerAssessment.state,
          executedOperations: result.preparation.executedOperations,
        }
      : null,
    requirements:
      result && fixture.expected.criticalRequirements?.length
        ? scoreRequirements(fixture.expected, result.sourceUnderstanding)
        : null,
    level: result
      ? {
          assessed: assessment?.currentLevel ?? null,
          resolved: resolvedLevel,
          status: proficiency?.status ?? null,
          matches: levels.length ? levels.includes(resolvedLevel) : resolvedLevel === null,
        }
      : null,
    attempts: attempts.map((record) => ({
      operation: record.operation,
      outcome: record.outcome,
      chainIndex: record.chainIndex,
      eligibility: record.eligibility,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      reasoningTokens: record.reasoningTokens,
      latencyMs: record.latencyMs,
      calculatedCost: record.calculatedCost,
      costCurrency: record.costCurrency,
    })),
    output: result
      ? { sourceUnderstanding: result.sourceUnderstanding ?? null, assessment: assessment ?? null }
      : null,
  };
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1)];
}

function rate(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : null;
}

function summarize(runs) {
  const byModel = {};
  for (const run of runs.filter((item) => item.outcome !== 'skipped')) {
    const operation = operationFor[fixtureFile.fixtures.find(({ id }) => id === run.fixture).case];
    if (!operation) continue;
    const key = `${run.model}|${operation}`;
    (byModel[key] ??= { model: run.model, operation, runs: [] }).runs.push(run);
  }
  return Object.values(byModel).map(({ model, operation, runs: group }) => {
    const answered = group.filter((run) => run.failureClass !== 'availability');
    const schemaValid = answered.filter((run) => run.failureClass !== 'schema');
    const evidenceValid = schemaValid.filter((run) => run.failureClass !== 'evidence');
    const critical = group.flatMap((run) => run.requirements?.critical ?? []);
    const latencies = group.flatMap((run) =>
      run.attempts
        .filter((attempt) => attempt.outcome === 'success')
        .map((attempt) => attempt.latencyMs),
    );
    const cost = group
      .flatMap((run) => run.attempts)
      .reduce((sum, attempt) => sum + (attempt.calculatedCost ?? 0), 0);
    return {
      model,
      operation,
      fixtures: [...new Set(group.map((run) => run.fixture))],
      runs: group.length,
      schemaPassRate: rate(schemaValid.length, answered.length),
      evidencePassRate: rate(evidenceValid.length, schemaValid.length),
      criticalRecall: critical.length
        ? rate(critical.filter((item) => item.found).length, critical.length)
        : null,
      levelMatchRate: rate(
        group.filter((run) => run.level?.matches).length,
        group.filter((run) => run.level).length,
      ),
      availabilityFailureRate: rate(
        group.filter((run) => run.failureClass === 'availability').length,
        group.length,
      ),
      failuresByClass: group.reduce((counts, run) => {
        if (run.failureClass) counts[run.failureClass] = (counts[run.failureClass] ?? 0) + 1;
        return counts;
      }, {}),
      latencyMs: { p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95) },
      cost: Number(cost.toFixed(6)),
    };
  });
}

const criteriaFor = {
  F1: ['C1', 'C6'],
  F2: ['C1', 'C6'],
  F3: ['C1', 'C6'],
  F4: ['C1', 'C2', 'C3', 'C4', 'C5', 'C7'],
  F5: ['C1', 'C2', 'C3', 'C4', 'C5', 'C7'],
  F6: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8'],
  F7: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
  F8: ['C1', 'C6', 'C7', 'C8'],
  F9: ['C1', 'C6', 'C7'],
};

function writeReviewTemplate(evaluationId, runs) {
  const file = `${paths.reviews}/${evaluationId}.json`;
  const existing = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  const items = existing?.items ?? [];
  for (const run of runs.filter((item) => item.outcome !== 'skipped')) {
    const model = criteriaFor[run.fixture].length === 2 ? 'none' : run.model;
    if (items.some((item) => item.fixture === run.fixture && item.model === model)) continue;
    items.push({
      fixture: run.fixture,
      model,
      criteria: criteriaFor[run.fixture],
      rating: null,
      notes: '',
    });
  }
  items.sort(
    (left, right) =>
      left.fixture.localeCompare(right.fixture) || left.model.localeCompare(right.model),
  );
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        evaluationId,
        instructions:
          'Owner review R1 (Plan 0002 section 6). Set each rating to "acceptable", "acceptable_with_notes" or "unacceptable" after reading the outputs in the runs file. This file is never filled in by a script.',
        reviewer: existing?.reviewer ?? null,
        reviewedAt: existing?.reviewedAt ?? null,
        items,
      },
      null,
      2,
    )}\n`,
  );
  return file;
}

mkdirSync(paths.runs, { recursive: true });
mkdirSync(paths.reviews, { recursive: true });
const evaluationId =
  args.evaluation ?? `eval-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
const runsFile = `${paths.runs}/${evaluationId}.json`;
const evaluation = existsSync(runsFile)
  ? JSON.parse(readFileSync(runsFile, 'utf8'))
  : {
      evaluationId,
      fixturesVersion: fixtureFile.version,
      startedAt: new Date().toISOString(),
      settings: {},
      runs: [],
    };
evaluation.settings[args.model] = {
  adapter,
  endpointClass: entry.endpointClass,
  retries: Number(process.env.AI_MAX_RETRIES_FAST),
  freeAttemptTimeoutMs: aiConfig.preparation.freeAttemptTimeoutMs,
  freeBudgetMs: aiConfig.preparation.freeBudgetMs,
  reasoningEffort: aiConfig.profileSettings.fast.reasoningEffort,
};
const save = () => {
  evaluation.updatedAt = new Date().toISOString();
  evaluation.summary = summarize(evaluation.runs);
  writeFileSync(runsFile, `${JSON.stringify(evaluation, null, 2)}\n`);
};

await connectMongo();
let requests = 0;
let stopReason = null;
try {
  outer: for (const fixture of fixtures) {
    const total = fixture.expected.case === 1 ? 1 : runsPerFixture;
    for (let run = 1; run <= total; run += 1) {
      const recorded = evaluation.runs.some(
        (item) => item.fixture === fixture.id && item.run === run && item.model === args.model,
      );
      if (recorded) continue;
      if (isFree && fixture.dataClass === 'personal') {
        evaluation.runs.push({
          fixture: fixture.id,
          run,
          model: args.model,
          outcome: 'skipped',
          reason: 'personal data never goes to free endpoints (D-1)',
        });
        continue;
      }
      if (requests >= maxRequests) {
        stopReason = `request limit ${maxRequests} reached`;
        break outer;
      }
      const record = await runOnce(fixture, run);
      if (
        record.errorCode === 'AI_NO_ELIGIBLE_MODEL' &&
        record.attempts.every(({ latencyMs, inputTokens }) => latencyMs < 100 && !inputTokens)
      ) {
        stopReason = `the model was skipped without a request (circuit breaker open after repeated availability failures); resume later with --evaluation=${evaluationId}`;
        break outer;
      }
      requests += record.attempts.length;
      evaluation.runs.push(record);
      save();
      const found = record.requirements
        ? `${record.requirements.critical.filter((item) => item.found).length}/${record.requirements.critical.length} critical`
        : '';
      console.log(
        [
          `${fixture.id}#${run}`,
          record.outcome,
          record.errorCode ?? '',
          record.router
            ? `case ${record.router.case}${record.router.caseMatches ? '' : ' (expected ' + fixture.expected.case + ')'}`
            : '',
          found,
          record.level
            ? `level ${record.level.resolved ?? 'unresolved'}${record.level.matches ? '' : ' (mismatch)'}`
            : '',
          `${record.attempts.length} request(s)`,
          `${(record.elapsedMs / 1000).toFixed(1)} s`,
        ]
          .filter(Boolean)
          .join(' | '),
      );
      if (
        [
          'AI_FREE_QUOTA_EXHAUSTED',
          'AI_FREE_PREPARATION_UNAVAILABLE',
          'AI_CREDITS_EXHAUSTED',
        ].includes(record.errorCode)
      ) {
        stopReason = `stopped on ${record.errorCode}; resume later with --evaluation=${evaluationId}`;
        break outer;
      }
    }
  }
} finally {
  save();
  const reviewFile = writeReviewTemplate(evaluationId, evaluation.runs);
  await mongoose.disconnect();
  console.log(`\nEvaluation ${evaluationId}: ${requests} provider request(s) in this invocation.`);
  if (stopReason) console.log(`Stopped: ${stopReason}`);
  console.table(
    evaluation.summary.map((row) => ({
      model: row.model,
      operation: row.operation,
      runs: row.runs,
      schema: row.schemaPassRate,
      evidence: row.evidencePassRate,
      recall: row.criticalRecall,
      level: row.levelMatchRate,
      availabilityFail: row.availabilityFailureRate,
      p50ms: row.latencyMs.p50,
      p95ms: row.latencyMs.p95,
      cost: row.cost,
    })),
  );
  console.log(`Runs: ${runsFile}\nReview template: ${reviewFile}`);
}
