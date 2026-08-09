import OpenAI from 'openai';
import { AppError } from '../../../shared/app-error.js';
import { defineAiProvider } from './ai-provider.js';

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

function toProviderSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toProviderSchema);
  if (!schema || typeof schema !== 'object') return schema;

  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => !['$schema', '$id', 'format', 'uniqueItems'].includes(key))
      .map(([key, value]) => [key, toProviderSchema(value)]),
  );
}

function providerEndpoints(providerName, baseURL) {
  const base = new URL(baseURL);
  if (providerName === 'aicredits') {
    return Object.freeze({
      health: new URL('/health', base).toString(),
      models: new URL('/api/models', base).toString(),
    });
  }

  const models = new URL('models', `${base.toString().replace(/\/$/, '')}/`).toString();
  return Object.freeze({ health: models, models });
}

function modelIds(payload) {
  const models = Array.isArray(payload) ? payload : (payload?.data ?? payload?.models ?? []);
  return new Set(
    models
      .map((model) => (typeof model === 'string' ? model : (model?.id ?? model?.model)))
      .filter(Boolean),
  );
}

async function fetchJson(url, { apiKey, fetchImpl, timeout }) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(Math.min(timeout, 10_000)),
    });
  } catch (error) {
    throw new AppError('AI provider health check could not reach the configured endpoint', {
      status: 503,
      code: error?.name === 'TimeoutError' ? 'AI_PROVIDER_TIMEOUT' : 'AI_PROVIDER_UNAVAILABLE',
    });
  }

  if (!response.ok) {
    throw new AppError('AI provider health check failed', {
      status: 503,
      code:
        response.status === 401 ? 'AI_PROVIDER_AUTHENTICATION_FAILED' : 'AI_PROVIDER_UNAVAILABLE',
    });
  }

  try {
    return await response.json();
  } catch {
    throw new AppError('AI provider health check returned an invalid response', {
      status: 503,
      code: 'AI_PROVIDER_INVALID_HEALTH_RESPONSE',
    });
  }
}

function normalizeProviderError(error) {
  if (error instanceof AppError) return error;
  const providerText = [
    error?.message,
    error?.code,
    error?.type,
    error?.error?.code,
    error?.error?.message,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (
    error?.status === 402 ||
    providerText.includes('insufficient_quota') ||
    providerText.includes('quota') ||
    providerText.includes('credit') ||
    providerText.includes('balance') ||
    providerText.includes('payment required')
  ) {
    return new AppError('AI provider credits are exhausted', {
      status: 503,
      code: 'AI_CREDITS_EXHAUSTED',
    });
  }
  if (error?.status === 429) {
    return new AppError('AI provider is temporarily rate limited', {
      status: 503,
      code: 'AI_RATE_LIMITED',
    });
  }
  if (error?.status === 401 || error?.status === 403) {
    return new AppError('AI provider authentication failed', {
      status: 503,
      code: 'AI_PROVIDER_AUTHENTICATION_FAILED',
    });
  }
  if (
    error?.status === 408 ||
    error?.name === 'APIConnectionTimeoutError' ||
    error?.name === 'AbortError'
  ) {
    return new AppError('AI provider request timed out', {
      status: 504,
      code: 'AI_PROVIDER_TIMEOUT',
    });
  }
  return error;
}

export function createOpenAiCompatibleProvider({
  providerName = 'openai-compatible',
  apiKey,
  baseURL,
  timeout = 120_000,
  maxRetries = 2,
  client,
  fetchImpl = globalThis.fetch,
} = {}) {
  const sdk =
    client ??
    new OpenAI({
      apiKey,
      baseURL,
      timeout,
      maxRetries,
    });

  return defineAiProvider({
    name: providerName,

    async healthCheck({ models = [] } = {}) {
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
      const availableModels = modelIds(catalog);
      const missingModels = [...new Set(models)].filter(
        (model) => model && !availableModels.has(model),
      );

      if (missingModels.length > 0) {
        throw new AppError(`Configured AI model is unavailable: ${missingModels.join(', ')}`, {
          status: 503,
          code: 'AI_MODEL_UNAVAILABLE',
        });
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
      metadata,
    }) {
      const startedAt = Date.now();
      try {
        const response = await sdk.responses.create({
          model,
          instructions,
          input,
          store: false,
          ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
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
        });

        const refusal = findRefusal(response);
        if (refusal) {
          throw new AppError('The AI provider declined this request', {
            status: 422,
            code: 'AI_REFUSAL',
          });
        }

        if (!response.output_text) {
          throw new AppError('The AI provider returned no structured output', {
            status: 502,
            code: 'AI_EMPTY_RESPONSE',
          });
        }

        let data;
        try {
          data = JSON.parse(response.output_text);
        } catch {
          throw new AppError('The AI provider returned invalid JSON', {
            status: 502,
            code: 'AI_INVALID_JSON',
          });
        }

        return Object.freeze({
          data,
          provider: providerName,
          model: response.model ?? model,
          providerRequestId: response.id,
          latencyMs: Date.now() - startedAt,
          usage: normalizeUsage(response.usage),
        });
      } catch (error) {
        throw normalizeProviderError(error);
      }
    },
  });
}
