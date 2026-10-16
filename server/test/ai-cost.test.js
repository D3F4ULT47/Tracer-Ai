import assert from 'node:assert/strict';
import test from 'node:test';
import { aiSchemas } from '@tracer-ai/shared/schemas/ai';
import {
  calculateCost,
  normalizePricing,
  pricingFromAiCreditsCatalogEntry,
  usageAccounting,
} from '../src/modules/ai/accounting/ai-cost.js';
import { pipelineIdFrom } from '../src/modules/ai/accounting/pipeline-id.js';
import { createOpenAiCompatibleProvider } from '../src/modules/ai/providers/openai-compatible.provider.js';

const gpt55 = normalizePricing({
  input: 0.00050836,
  cachedInput: 0.00005084,
  output: 0.00305014,
  currency: 'INR',
  version: 'test',
});

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${expected}, received ${actual}`);
}

test('cost prices uncached input, cached input and output separately', () => {
  close(
    calculateCost({ inputTokens: 10_000, cachedInputTokens: 0, outputTokens: 2_000 }, gpt55)
      .calculatedCost,
    11.18388,
  );
  close(
    calculateCost({ inputTokens: 10_000, cachedInputTokens: 4_000, outputTokens: 2_000 }, gpt55)
      .calculatedCost,
    9.3538,
  );
  close(
    calculateCost({ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }, gpt55).calculatedCost,
    0,
  );
});

test('cost does not add reasoning tokens on top of output tokens', () => {
  const withReasoning = calculateCost(
    { inputTokens: 1_000, cachedInputTokens: 0, outputTokens: 500, reasoningTokens: 400 },
    gpt55,
  );
  const withoutReasoning = calculateCost(
    { inputTokens: 1_000, cachedInputTokens: 0, outputTokens: 500 },
    gpt55,
  );
  assert.equal(withReasoning.calculatedCost, withoutReasoning.calculatedCost);
});

test('cost falls back to the input price when the catalog has no cached price', () => {
  const pricing = normalizePricing({ input: 0.00050836, output: 0.00305014, currency: 'INR' });
  close(
    calculateCost({ inputTokens: 10_000, cachedInputTokens: 4_000, outputTokens: 2_000 }, pricing)
      .calculatedCost,
    11.18388,
  );
});

test('per-million prices are divided by one million exactly once', () => {
  const pricing = normalizePricing(
    { input: 508.36, cachedInput: 50.84, output: 3050.14, currency: 'INR' },
    { perMillion: true },
  );
  close(pricing.inputPricePerToken, 0.00050836);
  close(
    calculateCost({ inputTokens: 10_000, cachedInputTokens: 4_000, outputTokens: 2_000 }, pricing)
      .calculatedCost,
    9.3538,
  );
});

test('free endpoints cost zero', () => {
  const pricing = normalizePricing({ input: 0, cachedInput: 0, output: 0, currency: 'USD' });
  assert.equal(
    calculateCost({ inputTokens: 1_683, cachedInputTokens: 0, outputTokens: 707 }, pricing)
      .calculatedCost,
    0,
  );
});

test('cached tokens greater than input tokens are rejected as invalid usage', () => {
  assert.throws(
    () => calculateCost({ inputTokens: 10, cachedInputTokens: 11, outputTokens: 0 }, gpt55),
    (error) => error.code === 'AI_USAGE_INVALID',
  );
});

test('missing pricing leaves cost unknown instead of zero', () => {
  assert.equal(calculateCost({ inputTokens: 10, outputTokens: 10 }, null), null);
  const accounting = usageAccounting({ result: { usage: { inputTokens: 10, outputTokens: 10 } } });
  assert.equal('calculatedCost' in accounting, false);
});

test('AICredits catalog entries map to per-token INR pricing', () => {
  const pricing = pricingFromAiCreditsCatalogEntry({
    id: 'openai/gpt-5.5',
    input_cost_per_token_inr: 0.00050835589875,
    cached_input_cost_per_token_inr: 0.000050835589875,
    output_cost_per_token_inr: 0.0030501353925,
    last_updated: '2026-10-08T13:08:09Z',
  });
  assert.equal(pricing.currency, 'INR');
  assert.equal(pricing.version, '2026-10-08T13:08:09Z');
  assert.equal(pricing.inputPricePerToken, 0.00050835589875);
});

test('pipeline IDs are accepted only as UUIDs', () => {
  const request = (value) => ({ get: () => value });
  assert.equal(
    pipelineIdFrom(request('6F1C2D3E-4A5B-4C6D-8E7F-901234567890')),
    '6f1c2d3e-4a5b-4c6d-8e7f-901234567890',
  );
  assert.equal(pipelineIdFrom(request('not-a-uuid')), null);
  assert.equal(pipelineIdFrom(request(undefined)), null);
});

function catalogFetch(url) {
  return Promise.resolve({
    ok: true,
    async json() {
      if (url.endsWith('/health')) return { status: 'ok' };
      return {
        data: [
          {
            id: 'openai/gpt-5.5',
            input_cost_per_token_inr: 0.00050836,
            cached_input_cost_per_token_inr: 0.00005084,
            output_cost_per_token_inr: 0.00305014,
            last_updated: '2026-10-08T13:08:09Z',
          },
        ],
      };
    },
  });
}

const request = {
  model: 'openai/gpt-5.5',
  instructions: 'Return JSON.',
  input: '{}',
  schema: aiSchemas.intent,
  schemaName: 'intent',
};

test('provider retries transient failures itself and reports the attempt and cost', async () => {
  let calls = 0;
  const provider = createOpenAiCompatibleProvider({
    providerName: 'aicredits',
    apiKey: 'test-key',
    baseURL: 'https://api.aicredits.in/v1',
    maxRetries: 2,
    sleep: async () => {},
    fetchImpl: catalogFetch,
    client: {
      responses: {
        async create() {
          calls += 1;
          if (calls < 3) throw Object.assign(new Error('busy'), { status: 503 });
          return {
            id: 'response-id',
            output: [],
            output_text: JSON.stringify({ unused: true }),
            usage: {
              input_tokens: 10_000,
              input_tokens_details: { cached_tokens: 4_000 },
              output_tokens: 2_000,
              total_tokens: 12_000,
            },
          };
        },
      },
    },
  });
  await provider.healthCheck({ models: ['openai/gpt-5.5'] });

  const result = await provider.generateStructured(request);
  const accounting = usageAccounting({ result, pipelineId: 'pipeline' });

  assert.equal(calls, 3);
  assert.equal(accounting.attempt, 3);
  assert.equal(accounting.attemptKind, 'retry');
  assert.equal(accounting.endpointHost, 'api.aicredits.in');
  assert.equal(accounting.costCurrency, 'INR');
  assert.equal(accounting.pricingVersion, '2026-10-08T13:08:09Z');
  close(accounting.calculatedCost, 9.3538);
});

test('provider does not retry non-transient failures', async () => {
  let calls = 0;
  const provider = createOpenAiCompatibleProvider({
    providerName: 'aicredits',
    maxRetries: 2,
    sleep: async () => {},
    client: {
      responses: {
        async create() {
          calls += 1;
          throw Object.assign(new Error('Insufficient Balance'), { status: 402 });
        },
      },
    },
  });

  await assert.rejects(
    () => provider.generateStructured(request),
    (error) => error.code === 'AI_CREDITS_EXHAUSTED' && error.aiAttempt.attempt === 1,
  );
  assert.equal(calls, 1);
});

test('tokens spent on an unusable response are still accounted', async () => {
  const provider = createOpenAiCompatibleProvider({
    providerName: 'aicredits',
    apiKey: 'test-key',
    baseURL: 'https://api.aicredits.in/v1',
    fetchImpl: catalogFetch,
    client: {
      responses: {
        async create() {
          return {
            id: 'response-id',
            output: [],
            output_text: '{not json',
            usage: { input_tokens: 10_000, output_tokens: 2_000, total_tokens: 12_000 },
          };
        },
      },
    },
  });
  await provider.healthCheck({ models: ['openai/gpt-5.5'] });

  const error = await provider.generateStructured(request).catch((caught) => caught);
  const accounting = usageAccounting({ error });

  assert.equal(error.code, 'AI_INVALID_JSON');
  assert.equal(accounting.inputTokens, 10_000);
  assert.equal(accounting.outputTokens, 2_000);
  close(accounting.calculatedCost, 11.18388);
});
