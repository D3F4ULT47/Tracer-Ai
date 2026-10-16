import { AppError } from '../../../shared/app-error.js';

const PER_MILLION = 1_000_000;

function price(value, { perMillion }) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return perMillion ? number / PER_MILLION : number;
}

export function normalizePricing(
  { input, cachedInput = null, output, currency, version = null },
  { perMillion = false } = {},
) {
  const inputPricePerToken = price(input, { perMillion });
  const outputPricePerToken = price(output, { perMillion });
  if (inputPricePerToken === null || outputPricePerToken === null || !currency) return null;

  return Object.freeze({
    inputPricePerToken,
    cachedInputPricePerToken: price(cachedInput, { perMillion }),
    outputPricePerToken,
    currency,
    version,
  });
}

export function pricingFromAiCreditsCatalogEntry(entry) {
  return normalizePricing({
    input: entry?.input_cost_per_token_inr,
    cachedInput: entry?.cached_input_cost_per_token_inr,
    output: entry?.output_cost_per_token_inr,
    currency: 'INR',
    version: entry?.last_updated ?? null,
  });
}

// Token counts follow the OpenAI usage shape: cachedInputTokens is a subset of inputTokens,
// and reasoningTokens is a subset of outputTokens.
export function calculateCost(usage, pricing) {
  if (!pricing) return null;
  const inputTokens = usage?.inputTokens ?? 0;
  const cachedInputTokens = usage?.cachedInputTokens ?? 0;
  const outputTokens = usage?.outputTokens ?? 0;
  if (cachedInputTokens > inputTokens) {
    throw new AppError('Cached input tokens cannot exceed input tokens', {
      status: 500,
      code: 'AI_USAGE_INVALID',
    });
  }

  const cachedPrice = pricing.cachedInputPricePerToken ?? pricing.inputPricePerToken;
  const cost =
    (inputTokens - cachedInputTokens) * pricing.inputPricePerToken +
    cachedInputTokens * cachedPrice +
    outputTokens * pricing.outputPricePerToken;

  return Object.freeze({
    calculatedCost: cost,
    costCurrency: pricing.currency,
    pricingVersion: pricing.version,
  });
}

export function usageAccounting({ result, error, pipelineId = null }) {
  const source = result ?? error?.aiAttempt ?? {};
  const pricing = source.pricing ?? null;
  const usage = source.usage ?? null;
  const cost = usage ? calculateCost(usage, pricing) : null;

  return {
    pipelineId,
    inputTokens: usage?.inputTokens ?? 0,
    cachedInputTokens: usage?.cachedInputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    reasoningTokens: usage?.reasoningTokens ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
    attempt: source.attempt ?? 1,
    attemptKind: (source.attempt ?? 1) > 1 ? 'retry' : 'initial',
    endpointHost: source.endpointHost ?? null,
    endpointClass: source.endpointClass ?? null,
    ...(cost ?? {}),
    ...(pricing
      ? {
          inputPricePerToken: pricing.inputPricePerToken,
          cachedInputPricePerToken: pricing.cachedInputPricePerToken,
          outputPricePerToken: pricing.outputPricePerToken,
        }
      : {}),
    providerReportedCost: source.providerReportedCost ?? null,
    providerReportedCostCurrency: source.providerReportedCostCurrency ?? null,
  };
}
