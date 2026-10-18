import assert from 'node:assert/strict';
import test from 'node:test';
import OpenAI from 'openai';
import { aiSchemas } from '@tracer-ai/shared/schemas/ai';
import { buildUsageRecords } from '../src/modules/ai/accounting/usage-records.js';
import { parseModelChain } from '../src/modules/ai/ai.config.js';
import { createChatCompletionsProvider } from '../src/modules/ai/providers/chat-completions.provider.js';
import {
  DATA_CLASSES,
  applyEligibility,
  createModelChain,
  filterChainForDataClass,
} from '../src/modules/ai/providers/model-chain.js';
import { createOpenAiCompatibleProvider } from '../src/modules/ai/providers/openai-compatible.provider.js';
import { chainLimits } from '../src/modules/ai/providers/provider.factory.js';
import { toChatProviderSchema } from '../src/modules/ai/providers/provider-support.js';
import Ajv from 'ajv';

const intent = {
  intent: 'learning_goal',
  confidence: 0.9,
  evidence: [],
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function chatBody(content) {
  return {
    id: 'chat-id',
    model: 'served-model',
    choices: [{ index: 0, message: { role: 'assistant', content } }],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 40,
      total_tokens: 140,
      prompt_tokens_details: { cached_tokens: 20 },
      completion_tokens_details: { reasoning_tokens: 30 },
    },
  };
}

function responsesBody(text) {
  return {
    id: 'response-id',
    object: 'response',
    model: 'served-model',
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 40, total_tokens: 140 },
  };
}

/**
 * Builds real adapters whose SDK clients send through a recording fetch, so tests observe the
 * actual outbound host of every request.
 */
function harness(behaviour) {
  const requests = [];
  const recordingFetch = async (url, init) => {
    const target = new URL(url);
    const body = init?.body ? JSON.parse(init.body) : null;
    requests.push({ host: target.host, path: target.pathname, model: body?.model, body });
    return behaviour({ host: target.host, path: target.pathname, body, count: requests.length });
  };
  const client = (baseURL) =>
    new OpenAI({ apiKey: 'test-key', baseURL, fetch: recordingFetch, maxRetries: 0 });
  const sleep = async () => {};
  const providers = {
    aicredits: createOpenAiCompatibleProvider({
      providerName: 'aicredits',
      baseURL: 'https://api.aicredits.in/v1',
      client: client('https://api.aicredits.in/v1'),
      sleep,
    }),
    'aicredits-chat': createChatCompletionsProvider({
      providerName: 'aicredits-chat',
      baseURL: 'https://api.aicredits.in/v1',
      client: client('https://api.aicredits.in/v1'),
      sleep,
    }),
    openrouter: createChatCompletionsProvider({
      providerName: 'openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
      endpointClass: 'free',
      client: client('https://openrouter.ai/api/v1'),
      sleep,
    }),
  };
  return { requests, providerFor: (entry) => providers[entry.provider] };
}

const chainSpec =
  'openrouter:nvidia/nemotron-3-super-120b-a12b:free,aicredits-chat:openai/gpt-oss-120b,aicredits:openai/gpt-5-mini';

const request = {
  instructions: 'Classify the request.',
  input: 'Learn SQL',
  schema: aiSchemas.intent,
  schemaName: 'intent',
};

test('preparation chains get the budgets, paid cap and quota policy; generation does not', () => {
  const preparation = {
    freeBudgetMs: 60_000,
    freeAttemptTimeoutMs: 30_000,
    paidBudgetMs: 90_000,
    paidAttemptLimit: 2,
    freeUnavailablePolicy: 'reject',
  };
  assert.deepEqual(chainLimits('fast', preparation), {
    budget: { freeBudgetMs: 60_000, freeAttemptTimeoutMs: 30_000, paidBudgetMs: 90_000 },
    paidAttemptLimit: 2,
    freeUnavailablePolicy: 'reject',
  });
  assert.deepEqual(chainLimits('core', preparation), {});
});

test('model chains parse provider prefixes without splitting model IDs that contain colons', () => {
  const chain = parseModelChain(chainSpec, 'aicredits');
  assert.deepEqual(
    chain.map(({ provider, model, endpointClass }) => [provider, model, endpointClass]),
    [
      ['openrouter', 'nvidia/nemotron-3-super-120b-a12b:free', 'free'],
      ['aicredits-chat', 'openai/gpt-oss-120b', 'paid_approved'],
      ['aicredits', 'openai/gpt-5-mini', 'paid_approved'],
    ],
  );
  assert.deepEqual(parseModelChain('openai/gpt-5.5', 'aicredits'), [
    { provider: 'aicredits', model: 'openai/gpt-5.5', endpointClass: 'paid_approved' },
  ]);
});

test('personal data never reaches a free endpoint, including on fallback after failures', async () => {
  const { requests, providerFor } = harness(({ host }) =>
    host === 'api.aicredits.in' ? json({ error: { message: 'busy' } }, 503) : json(chatBody('{}')),
  );
  const entries = filterChainForDataClass(
    parseModelChain(chainSpec, 'aicredits'),
    DATA_CLASSES.PERSONAL,
  );
  const chain = createModelChain({ entries, providerFor, maxRetries: 2 });

  await assert.rejects(() => chain.generateStructured({ ...request, input: 'resume text' }));

  assert.ok(requests.length > 0);
  assert.equal(
    requests.some(({ host }) => host === 'openrouter.ai'),
    false,
  );
  assert.equal(requests.length, 6, 'two paid entries, each with one initial try and two retries');
});

test('a chain with only free entries cannot serve personal data', () => {
  const entries = filterChainForDataClass(
    parseModelChain('openrouter:nvidia/nemotron-3-super-120b-a12b:free', 'aicredits'),
    DATA_CLASSES.PERSONAL,
  );
  assert.throws(
    () => createModelChain({ entries, providerFor: () => null }),
    (error) => error.code === 'AI_NO_ELIGIBLE_MODEL',
  );
});

test('general data falls back from a rate-limited free model and reports retries and fallbacks', async () => {
  const { requests, providerFor } = harness(({ host, path }) => {
    if (host === 'openrouter.ai') return json({ error: { message: 'rate limited' } }, 429);
    return path.endsWith('/responses')
      ? json(responsesBody(JSON.stringify(intent)))
      : json(chatBody(JSON.stringify(intent)));
  });
  const entries = parseModelChain(chainSpec, 'aicredits');
  const chain = createModelChain({ entries, providerFor, maxRetries: 1 });

  const result = await chain.generateStructured(request);

  assert.deepEqual(result.data, intent);
  assert.equal(result.chainIndex, 1);
  assert.equal(result.attemptKind, 'fallback');
  assert.deepEqual(
    requests.map(({ host }) => host),
    ['openrouter.ai', 'openrouter.ai', 'api.aicredits.in'],
  );
  assert.deepEqual(
    result.attempts.map(({ attemptKind, chainIndex }) => [attemptKind, chainIndex]),
    [
      ['retry', 0],
      ['fallback', 1],
    ],
  );
});

test('one validation failure falls back with the same prompt, input and schema', async () => {
  const { requests, providerFor } = harness(({ count }) =>
    json(chatBody(JSON.stringify(count === 1 ? { wrong: true } : intent))),
  );
  const entries = parseModelChain(
    'aicredits-chat:openai/gpt-oss-120b,aicredits-chat:openai/gpt-5-mini',
    'aicredits',
  );
  const chain = createModelChain({ entries, providerFor, maxRetries: 0 });

  const result = await chain.generateStructured({
    ...request,
    validate: (data) => {
      if (!data.intent) {
        throw Object.assign(new Error('invalid'), { code: 'AI_SCHEMA_VALIDATION_FAILED' });
      }
    },
  });

  assert.deepEqual(result.data, intent);
  assert.deepEqual(
    requests.map(({ model }) => model),
    ['openai/gpt-oss-120b', 'openai/gpt-5-mini'],
  );
  assert.deepEqual(requests[0].body.messages, requests[1].body.messages);
  assert.deepEqual(requests[0].body.response_format, requests[1].body.response_format);
});

test('non-transient failures such as exhausted credit do not retry the same model', async () => {
  const { requests, providerFor } = harness(() =>
    json({ error: { message: 'Insufficient Balance' } }, 402),
  );
  const entries = parseModelChain('aicredits:openai/gpt-5.5', 'aicredits');
  const chain = createModelChain({ entries, providerFor, maxRetries: 2 });

  await assert.rejects(
    () => chain.generateStructured(request),
    (error) => error.code === 'AI_CREDITS_EXHAUSTED' && error.aiAttempts.length === 1,
  );
  assert.equal(requests.length, 1);
});

test('chat schemas replace type arrays with equivalent anyOf branches', () => {
  const typeArrays = (node) =>
    Array.isArray(node)
      ? node.flatMap(typeArrays)
      : node && typeof node === 'object'
        ? [
            ...(Array.isArray(node.type) ? [node.type] : []),
            ...Object.values(node).flatMap(typeArrays),
          ]
        : [];
  for (const [name, schema] of Object.entries(aiSchemas)) {
    assert.deepEqual(typeArrays(toChatProviderSchema(schema)), [], name);
  }

  const nullableLevel = {
    type: 'object',
    additionalProperties: false,
    required: ['level', 'note'],
    properties: {
      level: { type: ['string', 'null'], enum: ['beginner', 'expert', null] },
      note: { type: ['string', 'null'], description: 'optional' },
    },
  };
  const original = new Ajv({ strict: false }).compile(nullableLevel);
  const converted = new Ajv({ strict: false }).compile(toChatProviderSchema(nullableLevel));
  for (const value of [
    { level: 'beginner', note: null },
    { level: null, note: 'text' },
    { level: 'novice', note: null },
    { level: 3, note: null },
    { level: null, note: 4 },
  ]) {
    assert.equal(converted(value), original(value), JSON.stringify(value));
  }
});

test('chat adapter sends strict JSON schema output and maps chat usage', async () => {
  const { requests, providerFor } = harness(() => json(chatBody(JSON.stringify(intent))));
  const provider = providerFor({ provider: 'openrouter' });
  const model = 'nvidia/nemotron-3-super-120b-a12b:free';
  await provider.generateStructured({ ...request, model, reasoningEffort: 'low' });
  provider.restoreCatalog({ [model]: { supported_parameters: ['reasoning'] } });
  const result = await provider.generateStructured({ ...request, model, reasoningEffort: 'low' });

  assert.equal(requests[0].body.reasoning, undefined);
  assert.equal(requests[0].body.reasoning_effort, undefined);
  const body = requests[1].body;
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.equal(body.provider.require_parameters, true);
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.equal(result.endpointClass, 'free');
  assert.deepEqual(result.usage, {
    inputTokens: 100,
    cachedInputTokens: 20,
    outputTokens: 40,
    reasoningTokens: 30,
    totalTokens: 140,
  });
});

test('production removes unapproved models; development labels them', () => {
  const entries = parseModelChain(chainSpec, 'aicredits');
  const records = [
    {
      provider: 'aicredits',
      model: 'openai/gpt-5-mini',
      adapter: 'responses',
      operations: ['source_understanding'],
      status: 'approved',
    },
  ];
  const options = {
    operation: 'source_understanding',
    records,
    adapterOf: (entry) => (entry.provider === 'aicredits' ? 'responses' : 'chat'),
  };

  const production = applyEligibility(entries, { ...options, production: true });
  const development = applyEligibility(entries, { ...options, production: false });

  assert.deepEqual(
    production.map(({ model }) => model),
    ['openai/gpt-5-mini'],
  );
  assert.deepEqual(
    development.map(({ eligibility }) => eligibility),
    ['unapproved', 'unapproved', 'approved'],
  );
});

test('usage records are written per attempt with attempt kind and endpoint', async () => {
  const { providerFor } = harness(({ host }) =>
    host === 'openrouter.ai'
      ? json({ error: { message: 'down' } }, 503)
      : json(chatBody(JSON.stringify(intent))),
  );
  const entries = parseModelChain(
    'openrouter:nvidia/nemotron-3-super-120b-a12b:free,aicredits-chat:openai/gpt-oss-120b',
    'aicredits',
  );
  const result = await createModelChain({ entries, providerFor, maxRetries: 0 }).generateStructured(
    request,
  );

  const records = buildUsageRecords({
    runId: 'run',
    ownerId: null,
    pipelineId: 'pipeline',
    operation: 'source_understanding',
    prompt: { name: 'p', version: '1', hash: 'h' },
    outputSchemaVersion: '1.0.0',
    configuration: { provider: 'openrouter', model: 'x' },
    result,
    latencyMs: 1,
    outcome: 'success',
    failureOutcome: () => 'provider_error',
  });

  assert.deepEqual(
    records.map(({ provider, attemptKind, endpointHost, endpointClass, outcome }) => [
      provider,
      attemptKind,
      endpointHost,
      endpointClass,
      outcome,
    ]),
    [
      ['openrouter', 'initial', 'openrouter.ai', 'free', 'provider_error'],
      ['aicredits-chat', 'fallback', 'api.aicredits.in', 'paid_approved', 'success'],
    ],
  );
  assert.equal(records[1].inputTokens, 100);
});
