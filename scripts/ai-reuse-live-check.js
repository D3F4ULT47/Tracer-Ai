/**
 * Live check of caching, idempotency and in-flight deduplication against the running API and
 * real providers (Plan 0003). Spends provider credit; every input is synthetic.
 *
 *   node scripts/ai-reuse-live-check.js [--api=http://localhost:4000/api/v1] [--skip-generation]
 *                                       [--with-public-source=https://github.com/owner/repo]
 *
 * Requires the API and MongoDB running, FEATURE_FLAGS enabling `ai-learner-assessment` and
 * `ai-roadmap-generation`, and AI_RATE_LIMIT_ANONYMOUS_PER_HOUR of at least 20.
 * Provider calls are counted from `ai_usage_records` by pipeline ID, so the numbers are what was
 * actually sent to (or saved from) the provider, not what the API reported.
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
const api = option('api') ?? `http://localhost:${env.PORT}/api/v1`;
const skipGeneration = process.argv.includes('--skip-generation');
const publicSource = option('with-public-source');

const goal = `Learn event-driven backend design (synthetic check ${randomUUID().slice(0, 8)})`;
const learners = { first: randomUUID(), second: randomUUID() };
const results = [];

async function post(path, body, { learner, key = randomUUID(), pipelineId }) {
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
      AI_ASSESSMENT_DISABLED: 'set FEATURE_FLAGS={"ai-learner-assessment":true,...} and restart',
      AI_ROADMAP_GENERATION_DISABLED: 'add "ai-roadmap-generation":true to FEATURE_FLAGS',
      AI_RATE_LIMITED: 'raise AI_RATE_LIMIT_ANONYMOUS_PER_HOUR and restart the API',
      AI_CREDITS_EXHAUSTED: 'the AICredits balance is empty',
    }[code];
    throw new Error(`${path} failed with ${code}${hint ? ` — ${hint}` : ''}`);
  }
  return { payload, replayed: response.headers.get('idempotent-replayed') === 'true' };
}

async function roadmapAction({ learner, key = randomUUID(), pipelineId = randomUUID() }) {
  const options = { learner, key, pipelineId };
  const requests = [
    ['/ai/source-understanding', { sources: [{ type: 'natural_prompt', content: goal }] }],
  ];
  const understanding = await post(...requests[0], options);
  requests.push(['/ai/assessments', { inputs: { naturalLanguage: goal } }]);
  const assessment = await post(...requests[1], options);
  const context = await post(
    '/ai/learning-contexts',
    {
      assessment: assessment.payload.data.assessment,
      mode: 'quick',
      explicitInput: { primaryGoal: goal, goalType: 'career_goal', experienceLevel: 'beginner' },
      questionnaire: {},
      sourceVersions: { assessmentVersion: assessment.payload.data.assessment.schemaVersion },
    },
    { learner, pipelineId },
  );
  const previewBody = {
    context: context.payload.data.context,
    sourceUnderstanding: understanding.payload.data.understanding,
    anonymousSessionId: learners[learner],
  };
  if (!skipGeneration) {
    requests.push(['/ai/roadmaps/preview', previewBody]);
    await post(...requests[2], options);
  }
  return { pipelineId, key, learner, requests, previewBody };
}

/** Sends the same AI requests again with the same key, as a network retry would. */
async function retry(action) {
  const pipelineId = randomUUID();
  const responses = [];
  for (const [path, body] of action.requests) {
    responses.push(
      await post(path, body, { learner: action.learner, key: action.key, pipelineId }),
    );
  }
  return { pipelineId, replayed: responses.map((response) => response.replayed) };
}

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

const called = (summary, operation) => (summary[operation]?.providerAttempts ?? 0) > 0;
const hits = (summary, operation) => summary[operation]?.cacheHits ?? 0;
const settle = () => new Promise((resolve) => setTimeout(resolve, 500));

await mongoose.connect(env.MONGODB_URI);
try {
  const first = await roadmapAction({ learner: 'first' });
  await settle();
  const l1 = await counts(first.pipelineId);
  check(
    'L1 first roadmap calls the provider for each operation',
    called(l1, 'source_understanding') &&
      called(l1, 'learner_assessment') &&
      (skipGeneration || called(l1, 'roadmap_generation')),
    l1,
  );

  const replay = await retry(first);
  await settle();
  const l2 = await counts(replay.pipelineId);
  check(
    'L2 retry with the same key replays every AI response, 0 new records',
    replay.replayed.every(Boolean) && Object.keys(l2).length === 0,
    { replayed: replay.replayed, records: l2 },
  );

  const again = await roadmapAction({ learner: 'first' });
  await settle();
  const l3 = await counts(again.pipelineId);
  check(
    'L3 same learner, new action: preparation is a cache hit with 0 tokens',
    hits(l3, 'source_understanding') === 1 &&
      hits(l3, 'learner_assessment') === 1 &&
      !called(l3, 'source_understanding') &&
      !called(l3, 'learner_assessment') &&
      (l3.source_understanding?.tokens ?? 0) === 0,
    l3,
  );
  if (!skipGeneration) {
    check(
      'L3 generation is not cached and calls the provider again',
      called(l3, 'roadmap_generation'),
      l3,
    );

    const tabsPipeline = randomUUID();
    const tabs = await Promise.all(
      [1, 2].map(() =>
        post('/ai/roadmaps/preview', again.previewBody, {
          learner: 'first',
          pipelineId: tabsPipeline,
        }),
      ),
    );
    await settle();
    const l4 = await counts(tabsPipeline);
    check(
      'L4 two simultaneous identical previews share one provider call',
      tabs.length === 2 && (l4.roadmap_generation?.shared ?? 0) === 1,
      l4,
    );
  }

  const other = await roadmapAction({ learner: 'second' });
  await settle();
  const l5 = await counts(other.pipelineId);
  check(
    'L5 a different learner with the same goal gets no cached result',
    hits(l5, 'source_understanding') === 0 &&
      hits(l5, 'learner_assessment') === 0 &&
      called(l5, 'source_understanding') &&
      called(l5, 'learner_assessment'),
    l5,
  );

  if (publicSource) {
    const sources = [{ type: 'github_repository', url: publicSource }];
    const pipelines = [randomUUID(), randomUUID()];
    await post(
      '/ai/source-understanding',
      { sources },
      { learner: 'first', pipelineId: pipelines[0] },
    );
    await post(
      '/ai/source-understanding',
      { sources },
      { learner: 'second', pipelineId: pipelines[1] },
    );
    await settle();
    const l6 = await Promise.all(pipelines.map(counts));
    check(
      'L6 a public-only source is understood once and shared across learners',
      hits(l6[1], 'source_understanding') === 1 && !called(l6[1], 'source_understanding'),
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
