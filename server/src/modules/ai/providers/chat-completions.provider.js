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

// AICredits' catalog does not list per-model parameters, so a reasoning effort is only sent where
// the OpenRouter catalog confirms `reasoning` support.
function supportsReasoning(providerName, entry) {
  if (!isOpenRouter(providerName)) return false;
  const parameters = entry?.supported_parameters;
  return Array.isArray(parameters) && parameters.includes('reasoning');
}

function reasoningParameter(providerName, effort) {
  return isOpenRouter(providerName) ? { reasoning: { effort } } : { reasoning_effort: effort };
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
  const catalog = new Map();

  function applyCatalogEntries(models, entries) {
    for (const model of models) {
      const entry = entries.get(model);
      if (!entry) continue;
      catalog.set(model, {
        supported_parameters: entry.supported_parameters ?? null,
        supported_apis: entry.supported_apis ?? null,
        pricing: entry.pricing ?? null,
        created: entry.created ?? null,
        input_cost_per_token_inr: entry.input_cost_per_token_inr ?? null,
        cached_input_cost_per_token_inr: entry.cached_input_cost_per_token_inr ?? null,
        output_cost_per_token_inr: entry.output_cost_per_token_inr ?? null,
        last_updated: entry.last_updated ?? null,
      });
      const modelPricing = catalogPricing(providerName, entry);
      if (modelPricing) pricing.set(model, modelPricing);
    }
  }

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
      applyCatalogEntries(models, entries);

      return Object.freeze({ provider: providerName, models: Object.freeze([...new Set(models)]) });
    },

    catalogSnapshot() {
      return Object.fromEntries(catalog);
    },

    restoreCatalog(snapshot) {
      const entries = new Map(Object.entries(snapshot ?? {}));
      applyCatalogEntries([...entries.keys()], entries);
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
      signal,
      deadline = null,
    }) {
      const appliedEffort =
        reasoningEffort && supportsReasoning(providerName, catalog.get(model))
          ? reasoningEffort
          : null;
      const request = {
        model,
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: input },
        ],
        ...(maxOutputTokens ? { max_completion_tokens: maxOutputTokens } : {}),
        ...(appliedEffort ? reasoningParameter(providerName, appliedEffort) : {}),
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
        send: (options) => sdk.chat.completions.create(request, options),
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
        reasoningEffort: appliedEffort,
        signal,
        deadline,
      });
    },
  });
}
