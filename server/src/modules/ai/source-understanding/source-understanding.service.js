import { createHash, randomUUID } from 'node:crypto';
import { AI_SCHEMA_VERSION, getAiSchema } from '@tracer-ai/shared/schemas/ai';
import { logger } from '../../../infrastructure/logging/logger.js';
import { AppError } from '../../../shared/app-error.js';
import { buildUsageRecords } from '../accounting/usage-records.js';
import { aiConfig } from '../ai.config.js';
import { validateAiOutput } from '../json.validator.js';
import { loadPrompt } from '../prompt.repository.js';
import { DATA_CLASSES } from '../providers/model-chain.js';
import { getConfiguredAiProvider } from '../providers/provider.factory.js';
import { SourceHandlerRegistry } from './source-handler.registry.js';
import { registerDefaultSourceHandlers } from './source.handlers.js';
import { validateSourceUnderstandingInput } from './source-input.js';
import { sourceUnderstandingRepository } from './source-understanding.repository.js';
import {
  normalizeRequirementCriticality,
  validateSourceEvidence,
} from './source-understanding.validator.js';

const operation = 'source_understanding';
const promptName = 'source-understanding';
export const LEGACY_SOURCE_PROMPT_VERSION = '1.0.0';
export const ROUTED_SOURCE_PROMPT_VERSION = '1.1.0';

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function sourceUnderstandingProviderSchema(promptVersion = LEGACY_SOURCE_PROMPT_VERSION) {
  const schema = structuredClone(getAiSchema('sourceUnderstanding'));
  const source = getAiSchema('roadmapSource');
  schema.$defs.attribution = structuredClone(source.$defs.attribution);
  schema.$defs.location = structuredClone(source.$defs.location);
  schema.properties.sourceAttributions.items = { $ref: '#/$defs/attribution' };
  schema.required = schema.required.filter((property) => property !== 'sourceProcessing');
  delete schema.properties.sourceProcessing;
  delete schema.$defs.sourceProcessing;
  if (promptVersion === LEGACY_SOURCE_PROMPT_VERSION) {
    delete schema.properties.requirements;
    delete schema.$defs.requirement;
  } else {
    schema.required.push('requirements');
  }
  return schema;
}

function sourceInputType(sources) {
  if (sources.length > 1) return 'combined';
  return sources[0].type;
}

function sourceIdentifier(source) {
  return source.url ?? source.title ?? source.metadata.fileName ?? null;
}

function safeError(error, runId, log) {
  if (error instanceof AppError) return error;
  log.error(
    { errorName: error?.name, errorCode: error?.code, runId },
    'Source understanding failed',
  );
  return new AppError('Source understanding failed', {
    status: 502,
    code: 'SOURCE_UNDERSTANDING_PROVIDER_ERROR',
  });
}

export function sourceUnderstandingOutcome(error) {
  if (error.code === 'AI_REFUSAL') return 'refusal';
  if (
    ['AI_SCHEMA_VALIDATION_FAILED', 'SOURCE_UNDERSTANDING_EVIDENCE_INVALID'].includes(error.code)
  ) {
    return 'invalid_output';
  }
  return 'provider_error';
}

export function dataClassForSources(sources) {
  return sources.some((source) => source.type === 'resume')
    ? DATA_CLASSES.PERSONAL
    : DATA_CLASSES.GENERAL;
}

/**
 * Turns model output into a validated understanding for already-normalized sources.
 */
export function finalizeUnderstanding(data, normalized, promptVersion) {
  const understanding = {
    ...data,
    schemaVersion: promptVersion,
    understandingId: randomUUID(),
    generatedAt: normalized.capturedAt.toISOString(),
    mode: normalized.sources.length > 1 ? 'mixed' : 'single',
    sourceAttributions: normalized.sources.map((source) => source.attribution),
    sourceProcessing: normalized.sourceProcessing,
  };
  validateAiOutput('sourceUnderstanding', understanding);
  validateSourceEvidence(understanding, normalized.sources);
  return normalizeRequirementCriticality(understanding);
}

function defaultRegistry() {
  return registerDefaultSourceHandlers(new SourceHandlerRegistry());
}

export function createSourceUnderstandingService({
  registry = defaultRegistry(),
  providerResolver = getConfiguredAiProvider,
  promptLoader = loadPrompt,
  repositories = sourceUnderstandingRepository,
  now = () => new Date(),
  log = logger,
} = {}) {
  /**
   * Fetches and normalizes every source independently. Failures are reported per source rather
   * than thrown, so callers decide whether the remaining sources are enough.
   */
  async function normalize(rawSources) {
    const { sources: inputs } = validateSourceUnderstandingInput({ sources: rawSources });
    const capturedAt = now();
    const normalization = await Promise.allSettled(
      inputs.map((input) => registry.get(input.type).normalize(input, { now: () => capturedAt })),
    );
    const sources = normalization
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
    const sourceProcessing = normalization.map((result, index) => ({
      sourceType: inputs[index].type,
      identifier: sourceIdentifier(inputs[index]),
      status: result.status === 'fulfilled' ? 'processed' : 'failed',
      errorCode:
        result.status === 'rejected' ? (result.reason?.code ?? 'SOURCE_PROCESSING_FAILED') : null,
    }));
    const failures = normalization
      .map((result, index) => ({ result, index }))
      .filter(({ result }) => result.status === 'rejected')
      .map(({ result, index }) => ({ input: inputs[index], reason: result.reason }));
    return { inputs, sources, sourceProcessing, failures, capturedAt };
  }

  async function understandNormalized({
    normalized,
    ownerId,
    requestId,
    pipelineId = null,
    profile = 'core',
    promptVersion = LEGACY_SOURCE_PROMPT_VERSION,
  }) {
    const { inputs, sources } = normalized;
    const prompt = await promptLoader(promptName, promptVersion);
    const { provider, configuration } = providerResolver(profile, {
      operation,
      dataClass: dataClassForSources(inputs),
    });
    const runId = randomUUID();
    const startedAt = Date.now();
    const recordUsage = (fields) =>
      Promise.all(
        buildUsageRecords({
          runId,
          ownerId,
          pipelineId,
          operation,
          prompt,
          outputSchemaVersion: AI_SCHEMA_VERSION,
          configuration,
          latencyMs: Date.now() - startedAt,
          failureOutcome: sourceUnderstandingOutcome,
          ...fields,
        }).map((record) => repositories.usage.record(record)),
      );
    await repositories.prompts.ensure(prompt);
    await repositories.runs.create({
      runId,
      ownerId,
      requestId,
      pipelineId,
      operation,
      inputHash: hash(sources.map(({ contentHash, type }) => ({ contentHash, type }))),
      inputType: sourceInputType(inputs),
      mode: 'analysis',
    });

    let result;
    try {
      result = await provider.generateStructured({
        model: configuration.model,
        instructions: prompt.content,
        input: JSON.stringify({ sources }),
        schema: sourceUnderstandingProviderSchema(promptVersion),
        schemaName: 'source_understanding',
        schemaDescription: 'Evidence-grounded understanding of one or more roadmap sources.',
        maxOutputTokens: aiConfig.sourceUnderstandingMaxOutputTokens,
        metadata: { run_id: runId, operation },
        validate: (data) => finalizeUnderstanding(data, normalized, promptVersion),
      });
      const understanding = finalizeUnderstanding(result.data, normalized, promptVersion);
      await recordUsage({ result, outcome: 'success' });
      await repositories.runs.complete(runId);
      return Object.freeze({ understanding: Object.freeze(understanding), runId });
    } catch (error) {
      const safe = safeError(error, runId, log);
      try {
        await recordUsage({ result, error, outcome: sourceUnderstandingOutcome(safe) });
        await repositories.runs.fail(runId, safe);
      } catch (accountingError) {
        log.error({ err: accountingError, runId }, 'Source understanding accounting failed');
      }
      throw safe;
    }
  }

  return Object.freeze({
    normalize,
    understandNormalized,

    async understand({ ownerId, requestId, sources: rawSources, pipelineId = null, profile }) {
      const normalized = await normalize(rawSources);
      if (normalized.sources.length === 0) throw normalized.failures[0].reason;
      if (normalized.failures.length > 0) {
        log.warn(
          { sourceProcessing: normalized.sourceProcessing },
          'Canonical understanding continued after one or more source failures',
        );
      }
      return understandNormalized({ normalized, ownerId, requestId, pipelineId, profile });
    },
  });
}

export const sourceUnderstandingService = createSourceUnderstandingService();
