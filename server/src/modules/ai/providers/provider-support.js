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

export function catalogEntries(payload) {
  const models = Array.isArray(payload) ? payload : (payload?.data ?? payload?.models ?? []);
  return models
    .map((model) =>
      typeof model === 'string' ? { id: model } : { ...model, id: model?.id ?? model?.model },
    )
    .filter((model) => model.id);
}

export function isRetryable(error) {
  if (error instanceof OpenAI.APIConnectionError) return true;
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

/**
 * Sends one request with same-model retries on transient errors. `parse.usage` reads token usage
 * before `parse.data` can reject the output, so failures after tokens were spent are still
 * accounted on `error.aiAttempt`.
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
}) {
  const startedAt = Date.now();
  let attempt = 1;
  let parsed = null;
  let response;
  const accounting = () => ({
    attempt,
    endpointHost,
    endpointClass,
    pricing: pricing ?? null,
    usage: parsed?.usage ?? null,
    providerReportedCost: parsed?.reportedCost ?? null,
    providerReportedCostCurrency: parsed?.reportedCostCurrency ?? null,
  });

  try {
    for (; ; attempt += 1) {
      try {
        response = await send();
        break;
      } catch (error) {
        if (attempt > maxRetries || !isRetryable(error)) throw error;
        await sleep(retryDelayMs(error, attempt));
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
