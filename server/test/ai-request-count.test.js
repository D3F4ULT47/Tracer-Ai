/**
 * Provider calls per request scenario (Plan 0003). The HTTP layer, idempotency middleware, reuse
 * layer and scope rules are the real ones; only the model provider is a counter. Several
 * learners are simulated with separate anonymous session IDs.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { createAiResultStore } from '../src/infrastructure/cache/ai-result-store.js';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { DATA_CLASSES } from '../src/modules/ai/providers/model-chain.js';
import { idempotent } from '../src/modules/ai/reuse/idempotency.js';
import { createReuseLayer } from '../src/modules/ai/reuse/reusable-provider.js';
import {
  ANONYMOUS_SESSION_HEADER,
  learnerScope,
  requestScope,
  sourceScope,
} from '../src/modules/ai/reuse/reuse-scope.js';
import { memoryIdempotencyRepository } from './support/memory-idempotency-repository.js';

const config = Object.freeze({
  idempotencyEnabled: true,
  idempotencyTtlSeconds: 86_400,
  idempotencyWaitMs: 2_000,
  dedupEnabled: true,
  resultCacheEnabled: true,
  publicTtlSeconds: 604_800,
  ownerTtlSeconds: 3_600,
});
const silent = { warn() {}, info() {}, error() {}, debug() {} };
const schema = { type: 'object', required: ['answer'], properties: { answer: {} } };
const learners = {
  asha: '11111111-1111-4111-8111-111111111111',
  ben: '22222222-2222-4222-8222-222222222222',
  chen: '33333333-3333-4333-8333-333333333333',
};
const goalSources = [{ type: 'natural_prompt', content: 'Learn distributed systems' }];
const publicSources = [{ type: 'github_repository', url: 'https://github.com/example/public' }];
const resumeSources = [...publicSources, { type: 'resume', content: 'EXPERIENCE\nSynthetic' }];
const assessmentInputs = { naturalLanguage: 'Learn distributed systems' };
const context = { goal: 'Learn distributed systems', level: 'beginner' };

/** Mirrors the controller → service → provider factory wiring for each AI endpoint. */
function scenarioApp() {
  const layer = createReuseLayer({
    store: createAiResultStore({ redisReady: () => false }),
    config,
    log: silent,
  });
  const calls = [];
  let gate = null;
  const provider = {
    async generateStructured({ metadata }) {
      calls.push(metadata.operation);
      if (gate) await gate.promise;
      return {
        data: { answer: `${metadata.operation} result` },
        provider: 'aicredits',
        model: 'openai/gpt-5.5',
        usage: { inputTokens: 100, cachedInputTokens: 0, outputTokens: 50, totalTokens: 150 },
      };
    },
  };
  const app = express();
  app.use(express.json());
  const repository = memoryIdempotencyRepository();

  function aiRoute(path, operation, { scopeOf, dataClassOf, cacheTtlOf, inputOf }) {
    app.post(
      path,
      idempotent(operation, { repository, config, log: silent }),
      async (httpRequest, response, next) => {
        try {
          const dataClass = dataClassOf(httpRequest.body);
          const scope = scopeOf(httpRequest, dataClass);
          const wrapped = layer.wrap(provider, {
            operation,
            scope,
            dataClass,
            models: ['aicredits:openai/gpt-5.5'],
            cacheTtlSeconds: cacheTtlOf(scope),
          });
          const result = await wrapped.generateStructured({
            instructions: `${operation} prompt 1.0.0`,
            input: JSON.stringify(inputOf(httpRequest.body)),
            schema,
            metadata: { run_id: randomUUID(), operation },
          });
          response.json({ success: true, data: { reuse: result.reuse?.outcome ?? null } });
        } catch (error) {
          next(error);
        }
      },
    );
  }

  aiRoute('/ai/source-understanding', 'source_understanding', {
    dataClassOf: ({ sources }) =>
      sources.some(({ type }) => type === 'resume') ? DATA_CLASSES.PERSONAL : DATA_CLASSES.GENERAL,
    scopeOf: (httpRequest, dataClass) =>
      sourceScope({
        sources: httpRequest.body.sources,
        dataClass,
        learner: requestScope(httpRequest),
      }),
    cacheTtlOf: (scope) =>
      scope?.kind === 'public' ? config.publicTtlSeconds : config.ownerTtlSeconds,
    inputOf: ({ sources }) => ({ sources }),
  });
  aiRoute('/ai/assessments', 'learner_assessment', {
    dataClassOf: ({ inputs }) => (inputs.resumeText ? DATA_CLASSES.PERSONAL : DATA_CLASSES.GENERAL),
    scopeOf: (httpRequest) => requestScope(httpRequest),
    cacheTtlOf: () => config.ownerTtlSeconds,
    inputOf: ({ inputs }) => inputs,
  });
  aiRoute('/ai/roadmaps/preview', 'roadmap_generation', {
    dataClassOf: () => DATA_CLASSES.PERSONAL,
    scopeOf: (httpRequest) =>
      learnerScope({ anonymousSessionId: httpRequest.body.anonymousSessionId }),
    cacheTtlOf: () => 0,
    inputOf: ({ context: learningContext }) => ({ learningContext }),
  });
  app.use(errorHandler);

  return {
    app,
    calls,
    count: (operation) => calls.filter((name) => name === operation).length,
    hold() {
      let release;
      const promise = new Promise((resolve) => {
        release = resolve;
      });
      gate = { promise };
      return () => {
        gate = null;
        release();
      };
    },
  };
}

function send(app, path, learner, body, key = randomUUID()) {
  return request(app)
    .post(path)
    .set(ANONYMOUS_SESSION_HEADER, learners[learner])
    .set('Idempotency-Key', key)
    .send(body);
}

/** One full roadmap action: source understanding, assessment, preview, sharing one key. */
async function generateRoadmap(app, learner, key = randomUUID()) {
  const responses = [
    await send(app, '/ai/source-understanding', learner, { sources: goalSources }, key),
    await send(app, '/ai/assessments', learner, { inputs: assessmentInputs }, key),
    await send(
      app,
      '/ai/roadmaps/preview',
      learner,
      { context, anonymousSessionId: learners[learner], generationSessionId: randomUUID() },
      key,
    ),
  ];
  for (const response of responses)
    assert.equal(response.status, 200, JSON.stringify(response.body));
  return responses;
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('S1 a first roadmap makes one provider call per operation (3 calls)', async () => {
  const { app, calls, count } = scenarioApp();
  await generateRoadmap(app, 'asha');

  assert.equal(calls.length, 3);
  assert.equal(count('source_understanding'), 1);
  assert.equal(count('learner_assessment'), 1);
  assert.equal(count('roadmap_generation'), 1);
});

test('S2 a network retry with the same key replays every response (0 new calls)', async () => {
  const { app, calls } = scenarioApp();
  const key = randomUUID();
  await generateRoadmap(app, 'asha', key);
  await settle();
  const replays = await generateRoadmap(app, 'asha', key);

  assert.equal(calls.length, 3);
  for (const response of replays) assert.equal(response.headers['idempotent-replayed'], 'true');
});

test('S3 the same learner asking again reuses preparation, pays for generation (1 new call)', async () => {
  const { app, calls, count } = scenarioApp();
  await generateRoadmap(app, 'asha');
  const [understanding, assessment, preview] = await generateRoadmap(app, 'asha');

  assert.equal(calls.length, 4);
  assert.equal(count('roadmap_generation'), 2);
  assert.equal(understanding.body.data.reuse, 'cache_hit');
  assert.equal(assessment.body.data.reuse, 'cache_hit');
  assert.equal(preview.body.data.reuse, null);
});

test('S4 two tabs generating the same roadmap at once share one call', async () => {
  const { app, count, hold } = scenarioApp();
  const release = hold();
  const body = { context, anonymousSessionId: learners.asha };
  const first = send(app, '/ai/roadmaps/preview', 'asha', body).then((response) => response);
  const second = send(app, '/ai/roadmaps/preview', 'asha', body).then((response) => response);
  await new Promise((resolve) => setTimeout(resolve, 30));
  release();
  const outcomes = (await Promise.all([first, second])).map((response) => response.body.data.reuse);

  assert.equal(count('roadmap_generation'), 1);
  assert.deepEqual(outcomes.sort(), [null, 'shared_in_flight'].sort());
});

test('S5 a double-click with the same key runs once and replays the second response', async () => {
  const { app, count, hold } = scenarioApp();
  const release = hold();
  const key = randomUUID();
  const body = { context, anonymousSessionId: learners.asha };
  const first = send(app, '/ai/roadmaps/preview', 'asha', body, key).then((response) => response);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const second = send(app, '/ai/roadmaps/preview', 'asha', body, key).then((response) => response);
  await new Promise((resolve) => setTimeout(resolve, 20));
  release();
  const [, replay] = await Promise.all([first, second]);

  assert.equal(count('roadmap_generation'), 1);
  assert.equal(replay.headers['idempotent-replayed'], 'true');
});

test('S6 three learners with the same goal never share results (9 calls)', async () => {
  const { app, calls } = scenarioApp();
  for (const learner of ['asha', 'ben', 'chen']) await generateRoadmap(app, learner);

  assert.equal(calls.length, 9);
});

test('S7 public-only sources are understood once for every learner', async () => {
  const { app, count } = scenarioApp();
  const outcomes = [];
  for (const learner of ['asha', 'ben', 'chen']) {
    const response = await send(app, '/ai/source-understanding', learner, {
      sources: publicSources,
    });
    outcomes.push(response.body.data.reuse);
  }

  assert.equal(count('source_understanding'), 1);
  assert.deepEqual(outcomes, [null, 'cache_hit', 'cache_hit']);
});

test('S8 a resume next to public sources is never shared between learners', async () => {
  const { app, count } = scenarioApp();
  await send(app, '/ai/source-understanding', 'asha', { sources: resumeSources });
  await send(app, '/ai/source-understanding', 'ben', { sources: resumeSources });

  assert.equal(count('source_understanding'), 2);
});

test('S9 two learners generating at the same moment are not merged', async () => {
  const { app, count, hold } = scenarioApp();
  const release = hold();
  const pending = ['asha', 'ben'].map((learner) =>
    send(app, '/ai/roadmaps/preview', learner, {
      context,
      anonymousSessionId: learners[learner],
    }).then((response) => response),
  );
  await new Promise((resolve) => setTimeout(resolve, 30));
  release();
  const outcomes = (await Promise.all(pending)).map((response) => response.body.data.reuse);

  assert.equal(count('roadmap_generation'), 2);
  assert.deepEqual(outcomes, [null, null]);
});

test('S10 a key reused for a different request is rejected (0 calls)', async () => {
  const { app, calls } = scenarioApp();
  const key = randomUUID();
  await send(app, '/ai/assessments', 'asha', { inputs: assessmentInputs }, key);
  await settle();
  const misuse = await send(
    app,
    '/ai/assessments',
    'asha',
    { inputs: { naturalLanguage: 'x' } },
    key,
  );

  assert.equal(misuse.status, 422);
  assert.equal(calls.length, 1);
});
