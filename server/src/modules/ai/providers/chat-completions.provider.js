import { setTimeout as delay } from 'node:timers/promises';
import OpenAI from 'openai';
import { AppError } from '../../../shared/app-error.js';
import { normalizePricing, pricingFromAiCreditsCatalogEntry } from '../accounting/ai-cost.js';
import { defineAiProvider } from './ai-provider.js';
import { checkCatalog } from './openai-compatible.provider.js';
import {
  parseStructuredText,
  refusalError,
  sendWithRetries,
  toProviderSchema,
} from './provider-support.js';

function normalizeUsage(usage = {}) {
  return Object.freeze({
    inputTokens: usage.prompt_tokens ?? 0,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    totalTokens: usage.total_tokens ?? 0,
  });
}

function isOpenRouter(providerName) {
  return providerName.startsWith('openrouter');
}

function supportsStructuredChat(providerName, entry) {
  if (isOpenRouter(providerName)) {
    const parameters = entry?.supported_parameters;
    return !Array.isArray(parameters) || parameters.includes('structured_outputs');
  }
  const apis = entry?.supported_apis;
  return !Array.isArray(apis) || apis.some((api) => String(api).toLowerCase().includes('chat'));
}

function catalogPricing(providerName, entry) {
  if (isOpenRouter(providerName)) {
    return normalizePricing({
      input: entry?.pricing?.prompt,
      cachedInput: entry?.pricing?.input_cache_read,
      output: entry?.pricing?.completion,
      currency: 'USD',
      version: entry?.created ? String(entry.created) : null,
    });
  }
  return pricingFromAiCreditsCatalogEntry(entry);
}

export function createChatCompletionsProvider({
  providerName,
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
    api: 'chat',
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
      const unsupported = models.filter(
        (model) => !supportsStructuredChat(providerName, entries.get(model)),
      );
      if (unsupported.length > 0) {
        throw new AppError(
          `Configured AI model does not support structured chat output: ${unsupported.join(', ')}`,
          { status: 503, code: 'AI_MODEL_UNSUPPORTED_API' },
        );
      }
      for (const model of models) {
        const modelPricing = catalogPricing(providerName, entries.get(model));
        if (modelPricing) pricing.set(model, modelPricing);
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
    }) {
      const request = {
        model,
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: input },
        ],
        ...(maxOutputTokens ? { max_completion_tokens: maxOutputTokens } : {}),
        ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: schemaName,
            schema: toProviderSchema(schema),
            strict: true,
            ...(schemaDescription ? { description: schemaDescription } : {}),
          },
        },
        ...(isOpenRouter(providerName)
          ? { usage: { include: true }, provider: { require_parameters: true } }
          : {}),
      };

      return sendWithRetries({
        send: () => sdk.chat.completions.create(request),
        parse: {
          usage: (response) => ({
            usage: normalizeUsage(response.usage),
            reportedCost: typeof response.usage?.cost === 'number' ? response.usage.cost : null,
            reportedCostCurrency: typeof response.usage?.cost === 'number' ? 'USD' : null,
          }),
          data: (response) => {
            const message = response.choices?.[0]?.message;
            if (message?.refusal) throw refusalError();
            return parseStructuredText(message?.content);
          },
        },
        maxRetries: callMaxRetries ?? maxRetries,
        sleep,
        providerName,
        model,
        endpointHost,
        endpointClass,
        pricing: pricing.get(model),
      });
    },
  });
}
