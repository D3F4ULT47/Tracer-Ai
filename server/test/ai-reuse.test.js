import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../src/middlewares/error-handler.js';
import { createAiResultStore } from '../src/infrastructure/cache/ai-result-store.js';
import { canonicalJson } from '../src/modules/ai/accounting/fingerprint.js';
import { buildUsageRecords } from '../src/modules/ai/accounting/usage-records.js';
import { DATA_CLASSES } from '../src/modules/ai/providers/model-chain.js';
import { idempotent } from '../src/modules/ai/reuse/idempotency.js';
import { purgeLearnerReuseData } from '../src/modules/ai/reuse/purge.js';
import { REUSE_OUTCOMES, createReuseLayer } from '../src/modules/ai/reuse/reusable-provider.js';
import { PUBLIC_SCOPE, learnerScope, sourceScope } from '../src/modules/ai/reuse/reuse-scope.js';

const silent = { warn() {}, info() {}, error() {}, debug() {} };
const config = Object.freeze({
  idempotencyEnabled: true,
  idempotencyTtlSeconds: 86_400,
  idempotencyWaitMs: 2_000,
  dedupEnabled: true,
  resultCacheEnabled: true,
  publicTtlSeconds: 604_800,
  ownerTtlSeconds: 3_600,
});
const owner = learnerScope({ ownerId: '64b7f0c2a1b2c3d4e5f60718' });
const schema = {
  type: 'object',
  properties: { answer: { type: 'string' } },
  required: ['answer'],
  additionalProperties: false,
};
const baseRequest = Object.freeze({
  model: 'openai/gpt-5.5',
  instructions: 'Synthetic prompt 1.0.0',
  input: JSON.stringify({ goal: 'learn synthetic topic' }),
  schema,
  schemaName: 'synthetic',
  metadata: { run_id: 'run-1' },
});

function fakeProvider({ data = { answer: 'synthetic' }, gate = null } = {}) {
  const calls = [];
  return {
    calls,
    name: 'fake',
    async generateStructured(request) {
      calls.push(request);
      if (gate) await gate;
      return {
        data,
        provider: 'aicredits',
        model: request.model,
        endpointClass: 'paid_approved',
        endpointHost: 'api.example.test',
        pricing: {
          inputPricePerToken: 0.001,
          cachedInputPricePerToken: 0.0001,
          outputPricePerToken: 0.002,
          currency: 'INR',
          version: 'test',
        },
        usage: {
          inputTokens: 100,
          cachedInputTokens: 0,
          outputTokens: 50,
          reasoningTokens: 0,
          totalTokens: 150,
        },
        latencyMs: 10,
      };
    },
  };
}

function wrapped(layer, provider, overrides = {}) {
  return layer.wrap(provider, {
    operation: 'learner_assessment',
    scope: owner,
    dataClass: DATA_CLASSES.GENERAL,
    models: ['aicredits:openai/gpt-5.5'],
    cacheTtlSeconds: 3_600,
    ...overrides,
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Minimal Redis double: strings with PX expiry, NX, compare-and-delete and SCAN. */
function fakeRedis() {
  const values = new Map();
  return {
    status: 'ready',
    values,
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value, ...options) {
      if (options.includes('NX') && values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    },
    async del(...keys) {
      let removed = 0;
      for (const key of keys) removed += values.delete(key) ? 1 : 0;
      return removed;
    },
    async eval(_script, _count, key, token) {
      if (values.get(key) !== token) return 0;
      values.delete(key);
      return 1;
    },
    async scan(_cursor, _match, pattern) {
      const prefix = pattern.replace(/\*$/, '');
      return ['0', [...values.keys()].filter((key) => key.startsWith(prefix))];
    },
  };
}

test('canonical JSON ignores key order', () => {
  assert.equal(
    canonicalJson({ b: 1, a: { d: 2, c: [3] } }),
    canonicalJson({ a: { c: [3], d: 2 }, b: 1 }),
  );
});

test('a cached result is reused with zero tokens and its source run recorded', async () => {
  const layer = createReuseLayer({
    store: createAiResultStore({ redisReady: () => false }),
    config,
    log: silent,
  });
  const provider = fakeProvider();
  const chain = wrapped(layer, provider);

  const first = await chain.generateStructured(baseRequest);
  const second = await chain.generateStructured({ ...baseRequest, metadata: { run_id: 'run-2' } });

  assert.equal(provider.calls.length, 1);
  assert.equal(first.reuse, undefined);
  assert.equal(second.reuse.outcome, REUSE_OUTCOMES.HIT);
  assert.equal(second.reuse.sourceRunId, 'run-1');
  assert.equal(second.usage.totalTokens, 0);
  assert.deepEqual(second.data, first.data);

  const [record] = buildUsageRecords({
    runId: 'run-2',
    ownerId: null,
    operation: 'learner_assessment',
    prompt: { name: 'synthetic', version: '1.0.0', hash: 'h' },
    outputSchemaVersion: '1.0.0',
    configuration: { provider: 'aicredits', model: 'openai/gpt-5.5' },
    result: second,
    outcome: 'success',
  });
  assert.equal(record.reuseOutcome, 'cache_hit');
  assert.equal(record.sourceRunId, 'run-1');
  assert.equal(record.calculatedCost, 0);
});

test('changing prompt, schema, model or input misses the cache', async () => {
  const layer = createReuseLayer({
    store: createAiResultStore({ redisReady: () => false }),
    config,
    log: silent,
  });
  const provider = fakeProvider();
  await wrapped(layer, provider).generateStructured(baseRequest);

  await wrapped(layer, provider).generateStructured({
    ...baseRequest,
    instructions: 'Synthetic prompt 1.1.0',
  });
  await wrapped(layer, provider).generateStructured({
    ...baseRequest,
    schema: { ...schema, properties: { answer: { type: 'string', minLength: 1 } } },
  });
  await wrapped(layer, provider, { models: ['aicredits:openai/gpt-5.4'] }).generateStructured(
    baseRequest,
  );
  await wrapped(layer, provider).generateStructured({ ...baseRequest, input: '{"goal":"other"}' });

  assert.equal(provider.calls.length, 5);
});

test('results are never shared between learners', async () => {
  const layer = createReuseLayer({
    store: createAiResultStore({ redisReady: () => false }),
    config,
    log: silent,
  });
  const provider = fakeProvider();
  await wrapped(layer, provider).generateStructured(baseRequest);
  await wrapped(layer, provider, {
    scope: learnerScope({ anonymousSessionId: '11111111-1111-4111-8111-111111111111' }),
  }).generateStructured(baseRequest);

  assert.equal(provider.calls.length, 2);
});

test('a cached value that fails validation is discarded and the call runs again', async () => {
  const store = createAiResultStore({ redisReady: () => false });
  const layer = createReuseLayer({ store, config, log: silent });
  const provider = fakeProvider();
  await wrapped(layer, provider).generateStructured(baseRequest);

  const result = await wrapped(layer, provider).generateStructured({
    ...baseRequest,
    validate: () => {
      throw new Error('stale evidence');
    },
  });
  assert.equal(provider.calls.length, 2);
  assert.equal(result.reuse, undefined);
});

test('a cached value that no longer matches the schema is a miss', async () => {
  const layer = createReuseLayer({
    store: createAiResultStore({ redisReady: () => false }),
    config,
    log: silent,
  });
  await wrapped(layer, fakeProvider({ data: { answer: 7 } })).generateStructured(baseRequest);
  const provider = fakeProvider();

  const result = await wrapped(layer, provider).generateStructured(baseRequest);
  assert.equal(provider.calls.length, 1);
  assert.equal(result.data.answer, 'synthetic');
});

test('two identical calls in flight make one provider call', async () => {
  const layer = createReuseLayer({
    store: createAiResultStore({ redisReady: () => false }),
    config,
    log: silent,
  });
  const gate = deferred();
  const provider = fakeProvider({ gate: gate.promise });
  const chain = wrapped(layer, provider, { cacheTtlSeconds: 0 });

  const first = chain.generateStructured(baseRequest);
  const second = chain.generateStructured(baseRequest);
  gate.resolve();
  const [leader, follower] = await Promise.all([first, second]);

  assert.equal(provider.calls.length, 1);
  assert.equal(leader.usage.totalTokens, 150);
  assert.equal(follower.reuse.outcome, REUSE_OUTCOMES.SHARED);
  assert.equal(follower.usage.totalTokens, 0);
});

test('cancelling one of two shared calls does not abort the provider call', async () => {
  const layer = createReuseLayer({
    store: createAiResultStore({ redisReady: () => false }),
    config,
    log: silent,
  });
  const gate = deferred();
  const provider = fakeProvider({ gate: gate.promise });
  const chain = wrapped(layer, provider, { cacheTtlSeconds: 0 });
  const leaving = new AbortController();

  const first = chain.generateStructured({ ...baseRequest, signal: leaving.signal });
  const second = chain.generateStructured(baseRequest);
  leaving.abort();
  await assert.rejects(first, (error) => error.code === 'AI_REQUEST_CANCELLED');
  assert.equal(provider.calls[0].signal.aborted, false);
  gate.resolve();
  const result = await second;
  assert.equal(result.reuse.outcome, REUSE_OUTCOMES.SHARED);
});

test('followers receive the same failure without the leader attempt records', async () => {
  const layer = createReuseLayer({
    store: createAiResultStore({ redisReady: () => false }),
    config,
    log: silent,
  });
  const gate = deferred();
  const failure = Object.assign(new Error('credits exhausted'), {
    status: 402,
    code: 'AI_CREDITS_EXHAUSTED',
    aiAttempts: [{}],
  });
  const provider = {
    async generateStructured() {
      await gate.promise;
      throw failure;
    },
  };
  const chain = wrapped(layer, provider, { cacheTtlSeconds: 0 });
  const first = chain.generateStructured(baseRequest);
  const second = chain.generateStructured(baseRequest);
  gate.resolve();

  await assert.rejects(first, (error) => error === failure);
  await assert.rejects(
    second,
    (error) => error.code === 'AI_CREDITS_EXHAUSTED' && error.aiAttempts === undefined,
  );
});

test('two server instances sharing Redis make one provider call', async () => {
  const redis = fakeRedis();
  const store = createAiResultStore({ redis, redisReady: () => true, log: silent });
  const gate = deferred();
  const provider = fakeProvider({ gate: gate.promise });
  const instanceA = createReuseLayer({ store, config, log: silent, pollMs: 5 });
  const instanceB = createReuseLayer({ store, config, log: silent, pollMs: 5 });

  const first = wrapped(instanceA, provider, { cacheTtlSeconds: 0 }).generateStructured(
    baseRequest,
  );
  await new Promise((resolve) => setImmediate(resolve));
  const second = wrapped(instanceB, provider, { cacheTtlSeconds: 0 }).generateStructured(
    baseRequest,
  );
  await new Promise((resolve) => setTimeout(resolve, 20));
  gate.resolve();
  const [, follower] = await Promise.all([first, second]);

  assert.equal(provider.calls.length, 1);
  assert.equal(follower.reuse.outcome, REUSE_OUTCOMES.SHARED);
  assert.equal(
    [...redis.values.keys()].some((key) => key.startsWith('ai:inflight:')),
    false,
  );
});

test('a Redis outage falls back to calling the provider', async () => {
  const broken = {
    status: 'ready',
    async get() {
      throw Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' });
    },
    async set() {
      throw new Error('connection refused');
    },
    async eval() {
      throw new Error('connection refused');
    },
  };
  const store = createAiResultStore({ redis: broken, redisReady: () => true, log: silent });
  const layer = createReuseLayer({ store, config, log: silent });
  const provider = fakeProvider();

  const result = await wrapped(layer, provider).generateStructured(baseRequest);
  assert.equal(result.data.answer, 'synthetic');
  assert.equal(provider.calls.length, 1);
});

test('personal data cannot use the public scope', () => {
  const layer = createReuseLayer({
    store: createAiResultStore({ redisReady: () => false }),
    config,
    log: silent,
  });
  assert.throws(() =>
    wrapped(layer, fakeProvider(), { scope: PUBLIC_SCOPE, dataClass: DATA_CLASSES.PERSONAL }),
  );
  assert.equal(
    sourceScope({
      sources: [{ type: 'github_repository' }, { type: 'resume' }],
      dataClass: DATA_CLASSES.PERSONAL,
      learner: owner,
    }),
    owner,
  );
  assert.equal(
    sourceScope({
      sources: [{ type: 'github_repository' }, { type: 'natural_prompt' }],
      dataClass: DATA_CLASSES.GENERAL,
      learner: owner,
    }),
    owner,
  );
  assert.equal(
    sourceScope({
      sources: [{ type: 'github_repository' }, { type: 'youtube_video' }],
      dataClass: DATA_CLASSES.GENERAL,
      learner: owner,
    }),
    PUBLIC_SCOPE,
  );
});

test('calls without a learner scope are passed straight to the provider', async () => {
  const layer = createReuseLayer({
    store: createAiResultStore({ redisReady: () => false }),
    config,
    log: silent,
  });
  const provider = fakeProvider();
  const chain = wrapped(layer, provider, { scope: null });
  await chain.generateStructured(baseRequest);
  await chain.generateStructured(baseRequest);
  assert.equal(provider.calls.length, 2);
});

test('deleting an account purges only that learner', async () => {
  const store = createAiResultStore({ redisReady: () => false });
  const layer = createReuseLayer({ store, config, log: silent });
  const provider = fakeProvider();
  const other = learnerScope({ ownerId: '64b7f0c2a1b2c3d4e5f60719' });
  await wrapped(layer, provider).generateStructured(baseRequest);
  await wrapped(layer, provider, { scope: other }).generateStructured(baseRequest);
  const deletedScopes = [];

  await purgeLearnerReuseData('64b7f0c2a1b2c3d4e5f60718', {
    reuse: layer,
    idempotency: { deleteScope: async (scope) => deletedScopes.push(scope) },
    log: silent,
  });
  await wrapped(layer, provider).generateStructured(baseRequest);
  await wrapped(layer, provider, { scope: other }).generateStructured(baseRequest);

  assert.equal(provider.calls.length, 3);
  assert.deepEqual(deletedScopes, ['owner:64b7f0c2a1b2c3d4e5f60718']);
});

function memoryIdempotencyRepository() {
  const records = new Map();
  let nextId = 1;
  const id = ({ scope, endpoint, key }) => `${scope}|${endpoint}|${key}`;
  const byId = (recordId) => [...records.values()].find((record) => record._id === recordId);
  return {
    records,
    async claim(data) {
      const existing = records.get(id(data));
      if (existing) return { record: { ...existing }, created: false };
      const record = { ...data, _id: nextId++, status: 'processing', updatedAt: new Date() };
      records.set(id(data), record);
      return { record: { ...record }, created: true };
    },
    async find(lookup) {
      const record = records.get(id(lookup));
      return record ? { ...record } : null;
    },
    async reclaimFailed(recordId) {
      const record = byId(recordId);
      if (record?.status !== 'failed') return false;
      record.status = 'processing';
      return true;
    },
    async reclaimStale(recordId, staleBefore) {
      const record = byId(recordId);
      if (record?.status !== 'processing' || !(record.updatedAt < staleBefore)) return false;
      record.updatedAt = new Date();
      return true;
    },
    async complete(recordId, responseStatus, body) {
      Object.assign(byId(recordId), {
        status: 'completed',
        responseStatus,
        responseBody: JSON.stringify(body),
      });
    },
    async fail(recordId) {
      byId(recordId).status = 'failed';
    },
  };
}

function idempotentApp({ repository, handler }) {
  const app = express();
  app.use(express.json());
  app.post(
    '/ai',
    idempotent('ai.test', {
      repository,
      config,
      log: silent,
      sleep: () => new Promise((r) => setTimeout(r, 5)),
    }),
    handler,
  );
  app.use(errorHandler);
  return app;
}

const key = '7d2c5d8e-6a1b-4c3d-9e8f-0a1b2c3d4e5f';

test('a repeated idempotency key returns the original response without running again', async () => {
  const repository = memoryIdempotencyRepository();
  let runs = 0;
  const app = idempotentApp({
    repository,
    handler: (_request, response) => {
      runs += 1;
      response.status(201).json({ success: true, data: { run: runs } });
    },
  });

  const first = await request(app)
    .post('/ai')
    .set('Idempotency-Key', key)
    .send({ goal: 'x', generationSessionId: 'a' });
  await new Promise((resolve) => setImmediate(resolve));
  const second = await request(app)
    .post('/ai')
    .set('Idempotency-Key', key)
    .send({ goal: 'x', generationSessionId: 'b' });

  assert.equal(runs, 1);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(second.headers['idempotent-replayed'], 'true');
  assert.deepEqual(second.body, first.body);
});

test('reusing a key for a different request is rejected without running', async () => {
  const repository = memoryIdempotencyRepository();
  let runs = 0;
  const app = idempotentApp({
    repository,
    handler: (_request, response) => {
      runs += 1;
      response.json({ success: true, data: {} });
    },
  });
  await request(app).post('/ai').set('Idempotency-Key', key).send({ goal: 'x' });
  await new Promise((resolve) => setImmediate(resolve));
  const reused = await request(app).post('/ai').set('Idempotency-Key', key).send({ goal: 'y' });

  assert.equal(reused.status, 422);
  assert.equal(reused.body.error.code, 'IDEMPOTENCY_KEY_REUSED');
  assert.equal(runs, 1);
});

test('a failed response is not replayed; the retry runs again', async () => {
  const repository = memoryIdempotencyRepository();
  let runs = 0;
  const app = idempotentApp({
    repository,
    handler: (_request, response) => {
      runs += 1;
      if (runs === 1) return response.status(502).json({ success: false, error: { code: 'X' } });
      return response.json({ success: true, data: {} });
    },
  });
  await request(app).post('/ai').set('Idempotency-Key', key).send({ goal: 'x' });
  await new Promise((resolve) => setImmediate(resolve));
  const retry = await request(app).post('/ai').set('Idempotency-Key', key).send({ goal: 'x' });

  assert.equal(retry.status, 200);
  assert.equal(runs, 2);
});

test('a retry while the original is still running waits for it and replays', async () => {
  const repository = memoryIdempotencyRepository();
  const gate = deferred();
  let runs = 0;
  const app = idempotentApp({
    repository,
    handler: async (_request, response) => {
      runs += 1;
      await gate.promise;
      response.json({ success: true, data: { run: runs } });
    },
  });
  const first = request(app)
    .post('/ai')
    .set('Idempotency-Key', key)
    .send({ goal: 'x' })
    .then((r) => r);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const second = request(app)
    .post('/ai')
    .set('Idempotency-Key', key)
    .send({ goal: 'x' })
    .then((r) => r);
  await new Promise((resolve) => setTimeout(resolve, 20));
  gate.resolve();
  const [original, replayed] = await Promise.all([first, second]);

  assert.equal(runs, 1);
  assert.deepEqual(replayed.body, original.body);
  assert.equal(replayed.headers['idempotent-replayed'], 'true');
});

test('requests without a key, or with the store down, run normally', async () => {
  let runs = 0;
  const handler = (_request, response) => {
    runs += 1;
    response.json({ success: true, data: {} });
  };
  const down = {
    async claim() {
      throw new Error('mongo unavailable');
    },
  };
  const app = idempotentApp({ repository: down, handler });

  assert.equal((await request(app).post('/ai').send({ goal: 'x' })).status, 200);
  assert.equal(
    (await request(app).post('/ai').set('Idempotency-Key', key).send({ goal: 'x' })).status,
    200,
  );
  assert.equal(
    (await request(app).post('/ai').set('Idempotency-Key', 'bad key!').send({})).status,
    400,
  );
  assert.equal(runs, 2);
});

test('a client disconnect does not fail the record; the handler result is still stored', async () => {
  const repository = memoryIdempotencyRepository();
  const middleware = idempotent('ai.test', { repository, config, log: silent });
  const response = Object.assign(new EventEmitter(), {
    statusCode: 201,
    writableFinished: false,
    json(payload) {
      return payload;
    },
  });
  const request = {
    body: { goal: 'x' },
    get: (name) => (name === 'idempotency-key' ? key : undefined),
  };
  await new Promise((resolve) => middleware(request, response, resolve));

  response.emit('close');
  response.json({ success: true, data: { run: 1 } });
  await new Promise((resolve) => setImmediate(resolve));

  const [record] = repository.records.values();
  assert.equal(record.status, 'completed');
  assert.equal(JSON.parse(record.responseBody).data.run, 1);
});

test('a record abandoned in processing is reclaimed by a later retry', async () => {
  const repository = memoryIdempotencyRepository();
  let runs = 0;
  const app = idempotentApp({
    repository,
    handler: (_request, response) => {
      runs += 1;
      response.json({ success: true, data: { run: runs } });
    },
  });
  await request(app).post('/ai').set('Idempotency-Key', key).send({ goal: 'x' });
  await new Promise((resolve) => setImmediate(resolve));
  const [record] = repository.records.values();
  Object.assign(record, {
    status: 'processing',
    responseBody: null,
    updatedAt: new Date(Date.now() - config.idempotencyWaitMs * 3),
  });

  const retry = await request(app).post('/ai').set('Idempotency-Key', key).send({ goal: 'x' });
  assert.equal(retry.status, 200);
  assert.equal(retry.body.data.run, 2);
});
