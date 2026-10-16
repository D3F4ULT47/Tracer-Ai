import { usageAccounting } from './ai-cost.js';

function record(base, { provider, model, result, error, pipelineId, latencyMs, outcome, extra }) {
  return {
    ...base,
    provider: result?.provider ?? provider,
    model: result?.model ?? model,
    ...usageAccounting({ result, error, pipelineId }),
    ...extra,
    latencyMs: result?.latencyMs ?? latencyMs,
    outcome,
    providerRequestId: result?.providerRequestId ?? null,
  };
}

/**
 * One usage record per provider attempt. Model-chain results carry `attempts`; a plain provider
 * result (or a failure before any attempt) produces a single record as before.
 */
export function buildUsageRecords({
  runId,
  ownerId,
  pipelineId = null,
  operation,
  prompt,
  outputSchemaVersion,
  configuration,
  result,
  error,
  latencyMs,
  outcome,
  failureOutcome,
}) {
  const base = {
    runId,
    ownerId,
    operation,
    promptName: prompt.name,
    promptVersion: prompt.version,
    promptHash: prompt.hash,
    outputSchemaVersion,
  };
  const attempts = result?.attempts ?? error?.aiAttempts;

  if (!attempts?.length) {
    return [
      record(base, {
        provider: configuration.provider,
        model: configuration.model,
        result,
        error,
        pipelineId,
        latencyMs,
        outcome,
      }),
    ];
  }

  return attempts.map((attempt, index) =>
    record(base, {
      provider: attempt.provider,
      model: attempt.model,
      result: attempt.result,
      error: attempt.error,
      pipelineId,
      latencyMs,
      outcome: index === attempts.length - 1 ? outcome : failureOutcome(attempt.error),
      extra: {
        attemptKind: attempt.attemptKind,
        chainIndex: attempt.chainIndex,
        eligibility: attempt.eligibility,
      },
    }),
  );
}
