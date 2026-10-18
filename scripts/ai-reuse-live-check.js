/**
 * Live check of caching, idempotency and in-flight deduplication on the routed preparation flow
 * (`/ai/roadmaps/prepare`) against the running API and real providers (Plan 0003). Spends
 * provider credit; every input is synthetic. The legacy endpoints are never called.
 *
 *   node scripts/ai-reuse-live-check.js [--api=http://localhost:4000/api/v1]
 *     [--with-other-learner] [--with-shared] [--with-generation]
 *
 * The default run makes one provider call (a learner assessment, RFC 0001 case 4) and checks that
 * a retry and a repeat by the same learner make none. Each option adds the provider calls it
 * names: another learner (1 call), two simultaneous identical requests (1 call), one roadmap
 * generation (1 call, the expensive one).
 *
 * Requires the API and MongoDB running, FEATURE_FLAGS enabling `ai-routed-preparation` and
 * `ai-learner-assessment` (and `ai-roadmap-generation` for --with-generation), and
 * AI_RATE_LIMIT_ANONYMOUS_PER_HOUR of at least 10. Provider calls are counted from
 * `ai_usage_records` by pipeline ID, so the numbers are what was actually sent to (or saved from)
 * the provider, not what the API reported.
 */
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { env } from '../server/src/config/env.js';

const option = (name) =>
  process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.split('=')
    .slice(1)
    .join('=');
const flag = (name) => process.argv.includes(`--${name}`);
const api = option('api') ?? `http://localhost:${env.PORT}/api/v1`;

const tag = randomUUID().slice(0, 8);
const goalFor = (suffix) =>
  `I'm a backend developer with 2 years of Node.js experience and I want to learn event-driven design (synthetic check ${tag}${suffix})`;
const learners = { first: randomUUID(), second: randomUUID() };
const results = [];

function prepareBody(goal) {
  return {
    mode: 'quick',
    sources: [{ type: 'natural_prompt', content: goal }],
    assessmentInputs: { naturalLanguage: goal },
    explicitInput: { primaryGoal: goal, goalType: 'learning_goal' },
    questionnaire: {},
  };
}

async function post(path, body, { learner, key = randomUUID(), pipelineId = randomUUID() }) {
  const response = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-tracer-anonymous-session-id': learners[learner],
      'x-tracer-pipeline-id': pipelineId,
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload?.error?.code ?? response.status;
    const hint = {
      404: 'set FEATURE_FLAGS with "ai-routed-preparation":true and restart the API',
      AI_ROADMAP_GENERATION_DISABLED: 'add "ai-roadmap-generation":true to FEATURE_FLAGS',
      AI_RATE_LIMITED: 'raise AI_RATE_LIMIT_ANONYMOUS_PER_HOUR and restart the API',
      AI_CREDITS_EXHAUSTED: 'the AICredits balance is empty',
    }[code];
    throw new Error(`${path} failed with ${code}${hint ? ` — ${hint}` : ''}`);
  }
  return {
    payload,
    pipelineId,
    replayed: response.headers.get('idempotent-replayed') === 'true',
  };
}

const prepare = (goal, options) => post('/ai/roadmaps/prepare', prepareBody(goal), options);

async function counts(pipelineId) {
  const records = await mongoose.connection.db
    .collection('ai_usage_records')
    .find({ pipelineId }, { projection: { operation: 1, reuseOutcome: 1, totalTokens: 1 } })
    .toArray();
  const summary = {};
  for (const record of records) {
    const entry = (summary[record.operation] ??= {
      providerAttempts: 0,
      cacheHits: 0,
      shared: 0,
      tokens: 0,
    });
    if (record.reuseOutcome === 'cache_hit') entry.cacheHits += 1;
    else if (record.reuseOutcome === 'shared_in_flight') entry.shared += 1;
    else entry.providerAttempts += 1;
    entry.tokens += record.totalTokens ?? 0;
  }
  return summary;
}

function check(name, condition, detail) {
  results.push({ name, passed: Boolean(condition), detail });
}

const assessment = 'learner_assessment';
const attempts = (summary, operation = assessment) => summary[operation]?.providerAttempts ?? 0;
const hits = (summary, operation = assessment) => summary[operation]?.cacheHits ?? 0;
const settle = () => new Promise((resolve) => setTimeout(resolve, 500));

await mongoose.connect(env.MONGODB_URI);
try {
  const goal = goalFor('');
  const key = randomUUID();
  const first = await prepare(goal, { learner: 'first', key });
  await settle();
  const l1 = await counts(first.pipelineId);
  const preparation = first.payload.data.preparation;
  check(
    'L1 first preparation routes to case 4 and calls the provider once',
    preparation.case === 4 && attempts(l1) === 1 && Object.keys(l1).length === 1,
    { case: preparation.case, executed: preparation.executedOperations, records: l1 },
  );

  const replay = await prepare(goal, { learner: 'first', key });
  await settle();
  const l2 = await counts(replay.pipelineId);
  check(
    'L2 retry with the same key replays the response, 0 new records',
    replay.replayed && Object.keys(l2).length === 0,
    { replayed: replay.replayed, records: l2 },
  );

  const again = await prepare(goal, { learner: 'first' });
  await settle();
  const l3 = await counts(again.pipelineId);
  check(
    'L3 same learner, new key: the assessment is a cache hit with 0 tokens',
    hits(l3) === 1 && attempts(l3) === 0 && (l3[assessment]?.tokens ?? 0) === 0,
    l3,
  );

  if (flag('with-other-learner')) {
    const other = await prepare(goal, { learner: 'second' });
    await settle();
    const l5 = await counts(other.pipelineId);
    check(
      'L5 a different learner with the same goal gets no cached result',
      hits(l5) === 0 && attempts(l5) === 1,
      l5,
    );
  }

  if (flag('with-shared')) {
    const sharedGoal = goalFor('-tabs');
    const pipelineId = randomUUID();
    await Promise.all([1, 2].map(() => prepare(sharedGoal, { learner: 'first', pipelineId })));
    await settle();
    const l4 = await counts(pipelineId);
    check(
      'L4 two simultaneous identical preparations share one provider call',
      attempts(l4) === 1 && (l4[assessment]?.shared ?? 0) === 1,
      l4,
    );
  }

  if (flag('with-generation')) {
    const pipelineId = randomUUID();
    await post(
      '/ai/roadmaps/preview',
      {
        context: first.payload.data.context,
        sourceUnderstanding: first.payload.data.sourceUnderstanding,
        anonymousSessionId: learners.first,
      },
      { learner: 'first', pipelineId },
    );
    await settle();
    const l6 = await counts(pipelineId);
    check(
      'L6 generation from the routed preparation calls the provider once',
      attempts(l6, 'roadmap_generation') === 1,
      l6,
    );
  }
} catch (error) {
  results.push({ name: 'live check aborted', passed: false, detail: error.message });
} finally {
  await mongoose.disconnect();
}

for (const result of results) {
  console.log(`${result.passed ? 'PASS' : 'FAIL'}  ${result.name}`);
  if (!result.passed) console.log(`      ${JSON.stringify(result.detail)}`);
}
console.log(`\n${results.filter((r) => r.passed).length}/${results.length} checks passed`);
process.exitCode = results.every((r) => r.passed) ? 0 : 1;
