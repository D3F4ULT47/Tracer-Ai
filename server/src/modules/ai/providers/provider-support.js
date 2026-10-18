import OpenAI from 'openai';
import { AppError } from '../../../shared/app-error.js';

export function toProviderSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toProviderSchema);
  if (!schema || typeof schema !== 'object') return schema;

  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => !['$schema', '$id', 'format', 'uniqueItems'].includes(key))
      .map(([key, value]) => [key, toProviderSchema(value)]),
  );
}

const valueMatchesType = {
  null: (value) => value === null,
  string: (value) => typeof value === 'string',
  number: (value) => typeof value === 'number',
  integer: (value) => Number.isInteger(value),
  boolean: (value) => typeof value === 'boolean',
};

function withSingleTypes(schema) {
  if (Array.isArray(schema)) return schema.map(withSingleTypes);
  if (!schema || typeof schema !== 'object') return schema;
  const node = Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [key, withSingleTypes(value)]),
  );
  if (!Array.isArray(node.type)) return node;
  if (node.type.length === 1) return { ...node, type: node.type[0] };

  const { type: types, description, ...keywords } = node;
  const branches = types.map((type) => {
    if (type === 'null') return { type: 'null' };
    const branch = { ...keywords, type };
    if (Array.isArray(keywords.enum)) {
      branch.enum = keywords.enum.filter((value) => valueMatchesType[type]?.(value) ?? true);
    }
    return branch;
  });
  return { ...(description ? { description } : {}), anyOf: branches };
}

/**
 * Chat Completions gateways such as AICredits reject `type` arrays (`["string", "null"]`) in a
 * strict JSON schema, so each union becomes the equivalent `anyOf` of single-type branches.
 */
export function toChatProviderSchema(schema) {
  return withSingleTypes(toProviderSchema(schema));
}

export function catalogEntries(payload) {
  const models = Array.isArray(payload) ? payload : (payload?.data ?? payload?.models ?? []);
  return models
    .map((model) =>
      typeof model === 'string' ? { id: model } : { ...model, id: model?.id ?? model?.model },
    )
    .filter((model) => model.id);
}

function providerText(error) {
  return [error?.message, error?.code, error?.type, error?.error?.code, error?.error?.message]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function header(error, name) {
  return error?.headers?.get?.(name) ?? null;
}

/**
 * OpenRouter's account-wide daily free-model limit, as opposed to the per-minute limit. A daily
 * 429 cannot succeed on any free model until the reset, so it is never retried.
 */
export function dailyQuotaResetAt(error, now = Date.now()) {
  if (error?.status !== 429) return null;
  const reset = Number(header(error, 'x-ratelimit-reset'));
  const resetAt = Number.isFinite(reset) && reset > 0 ? reset : null;
  const text = providerText(error);
  const daily =
    text.includes('per-day') ||
    text.includes('per day') ||
    (header(error, 'x-ratelimit-remaining') === '0' && resetAt !== null && resetAt - now > 60_000);
  if (!daily) return null;
  return resetAt ?? nextUtcMidnight(now);
}

function nextUtcMidnight(now) {
  const date = new Date(now);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

export function isRetryable(error) {
  if (error instanceof OpenAI.APIUserAbortError) return false;
  if (error instanceof OpenAI.APIConnectionError) return true;
  if (dailyQuotaResetAt(error) !== null) return false;
  const status = error?.status;
  return status === 408 || status === 409 || status === 429 || (status >= 500 && status < 600);
}

function requestedRetryDelayMs(headers) {
  const milliseconds = headers?.get?.('retry-after-ms');
  if (milliseconds) return Number(milliseconds);
  const seconds = headers?.get?.('retry-after');
  return seconds ? Number(seconds) * 1_000 : NaN;
}

export function retryDelayMs(error, retryNumber) {
  const requested = requestedRetryDelayMs(error?.headers);
  if (Number.isFinite(requested) && requested >= 0 && requested <= 60_000) return requested;
  return Math.min(500 * 2 ** (retryNumber - 1), 8_000) * (1 - Math.random() * 0.25);
}

export async function fetchJson(url, { apiKey, fetchImpl, timeout }) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
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

export function normalizeProviderError(error) {
  if (error instanceof AppError) return error;
  const resetAt = dailyQuotaResetAt(error);
  if (resetAt !== null) {
    return new AppError('The free AI model daily quota is exhausted', {
      status: 503,
      code: 'AI_FREE_QUOTA_EXHAUSTED',
      details: { retryAt: new Date(resetAt).toISOString() },
    });
  }
  const text = providerText(error);
  if (
    error?.status === 402 ||
    text.includes('insufficient_quota') ||
    text.includes('quota') ||
    text.includes('credit') ||
    text.includes('balance') ||
    text.includes('payment required')
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
    error instanceof OpenAI.APIUserAbortError ||
    error?.name === 'APIConnectionTimeoutError' ||
    error?.name === 'AbortError' ||
    error?.name === 'TimeoutError'
  ) {
    return new AppError('AI provider request timed out', {
      status: 504,
      code: 'AI_PROVIDER_TIMEOUT',
    });
  }
  return error;
}

export function parseStructuredText(text) {
  if (!text) {
    throw new AppError('The AI provider returned no structured output', {
      status: 502,
      code: 'AI_EMPTY_RESPONSE',
    });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('The AI provider returned invalid JSON', {
      status: 502,
      code: 'AI_INVALID_JSON',
    });
  }
}

export function refusalError() {
  return new AppError('The AI provider declined this request', {
    status: 422,
    code: 'AI_REFUSAL',
  });
}

// A retry is only worth starting if the backoff plus this much time for the call itself still
// fits before the deadline.
const RETRY_HEADROOM_MS = 10_000;

/**
 * Sends one request with same-model retries on transient errors. `parse.usage` reads token usage
 * before `parse.data` can reject the output, so failures after tokens were spent are still
 * accounted on `error.aiAttempt`. `signal` aborts the in-flight request; `deadline` (epoch ms)
 * stops retries that could not finish in time.
 */
export async function sendWithRetries({
  send,
  parse,
  maxRetries,
  sleep,
  providerName,
  model,
  endpointHost,
  endpointClass,
  pricing,
  reasoningEffort = null,
  signal,
  deadline = null,
}) {
  const startedAt = Date.now();
  let attempt = 1;
  let parsed = null;
  let response;
  const accounting = () => ({
    attempt,
    endpointHost,
    endpointClass,
    reasoningEffort,
    pricing: pricing ?? null,
    usage: parsed?.usage ?? null,
    providerReportedCost: parsed?.reportedCost ?? null,
    providerReportedCostCurrency: parsed?.reportedCostCurrency ?? null,
  });

  try {
    for (; ; attempt += 1) {
      try {
        response = await send(signal ? { signal } : undefined);
        break;
      } catch (error) {
        if (attempt > maxRetries || !isRetryable(error) || signal?.aborted) throw error;
        const wait = retryDelayMs(error, attempt);
        if (deadline !== null && Date.now() + wait + RETRY_HEADROOM_MS > deadline) throw error;
        await sleep(wait, undefined, signal ? { signal } : undefined);
      }
    }
    parsed = parse.usage(response);
    const data = parse.data(response);
    return Object.freeze({
      ...accounting(),
      data,
      provider: providerName,
      model: response.model ?? model,
      providerRequestId: response.id ?? null,
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    const normalized = normalizeProviderError(error);
    if (normalized instanceof Error) normalized.aiAttempt = Object.freeze(accounting());
    throw normalized;
  }
}
