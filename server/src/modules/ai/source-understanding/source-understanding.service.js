import { createHash, randomUUID } from 'node:crypto';
import { AI_SCHEMA_VERSION, getAiSchema } from '@tracer-ai/shared/schemas/ai';
import { logger } from '../../../infrastructure/logging/logger.js';
import { AppError } from '../../../shared/app-error.js';
import { aiConfig } from '../ai.config.js';
import { validateAiOutput } from '../json.validator.js';
import { loadPrompt } from '../prompt.repository.js';
import { getConfiguredAiProvider } from '../providers/provider.factory.js';
import { SourceHandlerRegistry } from './source-handler.registry.js';
import { registerDefaultSourceHandlers } from './source.handlers.js';
import { validateSourceUnderstandingInput } from './source-input.js';
import { sourceUnderstandingRepository } from './source-understanding.repository.js';
import { validateSourceEvidence } from './source-understanding.validator.js';

const operation = 'source_understanding';
const promptName = 'source-understanding';
const promptVersion = '1.0.0';

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function providerSchema() {
  const schema = structuredClone(getAiSchema('sourceUnderstanding'));
  const source = getAiSchema('roadmapSource');
  schema.$defs.attribution = structuredClone(source.$defs.attribution);
  schema.$defs.location = structuredClone(source.$defs.location);
  schema.properties.sourceAttributions.items = { $ref: '#/$defs/attribution' };
  schema.required = schema.required.filter((property) => property !== 'sourceProcessing');
  delete schema.properties.sourceProcessing;
  delete schema.$defs.sourceProcessing;
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

function outcome(error) {
  if (error.code === 'AI_REFUSAL') return 'refusal';
  if (
    ['AI_SCHEMA_VALIDATION_FAILED', 'SOURCE_UNDERSTANDING_EVIDENCE_INVALID'].includes(error.code)
  ) {
    return 'invalid_output';
  }
  return 'provider_error';
}

function usage({ runId, ownerId, prompt, configuration, result, latencyMs, resultType }) {
  const tokens = result?.usage ?? {};
  return {
    runId,
    ownerId,
    provider: result?.provider ?? configuration.provider,
    model: result?.model ?? configuration.model,
    operation,
    promptName: prompt.name,
    promptVersion: prompt.version,
    promptHash: prompt.hash,
    outputSchemaVersion: AI_SCHEMA_VERSION,
    inputTokens: tokens.inputTokens ?? 0,
    cachedInputTokens: tokens.cachedInputTokens ?? 0,
    outputTokens: tokens.outputTokens ?? 0,
    reasoningTokens: tokens.reasoningTokens ?? 0,
    totalTokens: tokens.totalTokens ?? 0,
    latencyMs: result?.latencyMs ?? latencyMs,
    outcome: resultType,
    providerRequestId: result?.providerRequestId ?? null,
  };
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
  return Object.freeze({
    async understand({ ownerId, requestId, sources: rawSources }) {
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
      if (sources.length === 0) throw normalization[0].reason;
      if (sources.length !== inputs.length) {
        log.warn(
          { sourceProcessing },
          'Canonical understanding continued after one or more source failures',
        );
      }
      const prompt = await promptLoader(promptName, promptVersion);
      const { provider, configuration } = providerResolver('core');
      const runId = randomUUID();
      await repositories.prompts.ensure(prompt);
      await repositories.runs.create({
        runId,
        ownerId,
        requestId,
        operation,
        inputHash: hash(sources.map(({ contentHash, type }) => ({ contentHash, type }))),
        inputType: sourceInputType(inputs),
        mode: 'analysis',
      });

      const startedAt = Date.now();
      let result;
      try {
        result = await provider.generateStructured({
          model: configuration.model,
          instructions: prompt.content,
          input: JSON.stringify({ sources }),
          schema: providerSchema(),
          schemaName: 'source_understanding',
          schemaDescription: 'Evidence-grounded understanding of one or more roadmap sources.',
          maxOutputTokens: aiConfig.sourceUnderstandingMaxOutputTokens,
          metadata: { run_id: runId, operation },
        });
        const understanding = {
          ...result.data,
          schemaVersion: '1.0.0',
          understandingId: randomUUID(),
          generatedAt: capturedAt.toISOString(),
          mode: sources.length > 1 ? 'mixed' : 'single',
          sourceAttributions: sources.map((source) => source.attribution),
          sourceProcessing,
        };
        validateAiOutput('sourceUnderstanding', understanding);
        validateSourceEvidence(understanding, sources);
        await repositories.usage.record(
          usage({
            runId,
            ownerId,
            prompt,
            configuration,
            result,
            latencyMs: Date.now() - startedAt,
            resultType: 'success',
          }),
        );
        await repositories.runs.complete(runId);
        return Object.freeze({ understanding: Object.freeze(understanding), runId });
      } catch (error) {
        const safe = safeError(error, runId, log);
        try {
          await repositories.usage.record(
            usage({
              runId,
              ownerId,
              prompt,
              configuration,
              result,
              latencyMs: Date.now() - startedAt,
              resultType: outcome(safe),
            }),
          );
          await repositories.runs.fail(runId, safe);
        } catch (accountingError) {
          log.error({ err: accountingError, runId }, 'Source understanding accounting failed');
        }
        throw safe;
      }
    },
  });
}

export const sourceUnderstandingService = createSourceUnderstandingService();
