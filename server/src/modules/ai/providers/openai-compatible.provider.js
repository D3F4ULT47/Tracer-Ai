import { setTimeout as delay } from 'node:timers/promises';
import OpenAI from 'openai';
import { AppError } from '../../../shared/app-error.js';
import { pricingFromAiCreditsCatalogEntry } from '../accounting/ai-cost.js';
import { defineAiProvider } from './ai-provider.js';
import {
  catalogEntries,
  fetchJson,
  parseStructuredText,
  refusalError,
  sendWithRetries,
  toProviderSchema,
} from './provider-support.js';

function findRefusal(response) {
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === 'refusal') return content.refusal;
    }
  }

  return null;
}

function normalizeUsage(usage = {}) {
  return Object.freeze({
    inputTokens: usage.input_tokens ?? 0,
    cachedInputTokens: usage.input_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  });
}

export function providerEndpoints(providerName, baseURL) {
  const base = new URL(baseURL);
  if (providerName.startsWith('aicredits')) {
    return Object.freeze({
      health: new URL('/health', base).toString(),
      models: new URL('/api/models', base).toString(),
    });
  }

  const models = new URL('models', `${base.toString().replace(/\/$/, '')}/`).toString();
  return Object.freeze({ health: models, models });
}

/**
 * Checks the gateway, confirms configured models exist, and returns their catalog entries.
 */
export async function checkCatalog({ providerName, apiKey, baseURL, timeout, fetchImpl, models }) {
  if (!apiKey || !baseURL) {
    throw new AppError('AI provider credentials are not configured', {
      status: 503,
      code: 'AI_NOT_CONFIGURED',
    });
  }

  const endpoints = providerEndpoints(providerName, baseURL);
  const health = await fetchJson(endpoints.health, { apiKey, fetchImpl, timeout });
  const catalog =
    endpoints.models === endpoints.health
      ? health
      : await fetchJson(endpoints.models, { apiKey, fetchImpl, timeout });
  const entries = new Map(catalogEntries(catalog).map((entry) => [entry.id, entry]));
  const missingModels = [...new Set(models)].filter((model) => model && !entries.has(model));

  if (missingModels.length > 0) {
    throw new AppError(`Configured AI model is unavailable: ${missingModels.join(', ')}`, {
      status: 503,
      code: 'AI_MODEL_UNAVAILABLE',
    });
  }

  return entries;
}

export function createOpenAiCompatibleProvider({
  providerName = 'openai-compatible',
  apiKey,
  baseURL,
  timeout = 120_000,
  maxRetries = 2,
  endpointClass = 'paid_approved',
  client,
  fetchImpl = globalThis.fetch,
  sleep = delay,
} = {}) {
  const sdk = client ?? new OpenAI({ apiKey, baseURL, timeout, maxRetries: 0 });
  const endpointHost = baseURL ? new URL(baseURL).host : null;
  const pricing = new Map();

  return defineAiProvider({
    name: providerName,
    api: 'responses',
    endpointClass,
    endpointHost,

    async healthCheck({ models = [] } = {}) {
      const entries = await checkCatalog({
        providerName,
        apiKey,
        baseURL,
        timeout,
        fetchImpl,
        models,
      });
      if (providerName.startsWith('aicredits')) {
        for (const model of models) {
          const modelPricing = pricingFromAiCreditsCatalogEntry(entries.get(model));
          if (modelPricing) pricing.set(model, modelPricing);
        }
      }

      return Object.freeze({ provider: providerName, models: Object.freeze([...new Set(models)]) });
    },

    async generateStructured({
      model,
      instructions,
      input,
      schema,
      schemaName,
      schemaDescription,
      maxOutputTokens,
      reasoningEffort,
      maxRetries: callMaxRetries,
      metadata,
      signal,
      deadline = null,
    }) {
      const request = {
        model,
        instructions,
        input,
        store: false,
        ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        ...(metadata ? { metadata } : {}),
        text: {
          format: {
            type: 'json_schema',
            name: schemaName,
            schema: toProviderSchema(schema),
            strict: true,
            ...(schemaDescription ? { description: schemaDescription } : {}),
          },
        },
      };

      return sendWithRetries({
        send: (options) => sdk.responses.create(request, options),
        parse: {
          usage: (response) => ({
            usage: normalizeUsage(response.usage),
            reportedCost: typeof response.usage?.cost === 'number' ? response.usage.cost : null,
            reportedCostCurrency: typeof response.usage?.cost === 'number' ? 'USD' : null,
          }),
          data: (response) => {
            if (findRefusal(response)) throw refusalError();
            return parseStructuredText(response.output_text);
          },
        },
        maxRetries: callMaxRetries ?? maxRetries,
        sleep,
        providerName,
        model,
        endpointHost,
        endpointClass,
        pricing: pricing.get(model),
        reasoningEffort: reasoningEffort ?? null,
        signal,
        deadline,
      });
    },
  });
}
