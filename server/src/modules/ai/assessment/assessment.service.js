import { randomUUID } from 'node:crypto';
import { AI_SCHEMA_VERSION, getAiSchema } from '@tracer-ai/shared/schemas/ai';
import {
  featureFlags,
  reservedFlags,
} from '../../../infrastructure/feature-flags/feature-flag-service.js';
import { logger } from '../../../infrastructure/logging/logger.js';
import { AppError } from '../../../shared/app-error.js';
import { aiConfig } from '../ai.config.js';
import { validateAiOutput } from '../json.validator.js';
import { loadPrompt } from '../prompt.repository.js';
import { getConfiguredAiProvider } from '../providers/provider.factory.js';
import { assessmentRepositories } from './assessment.repository.js';
import { validateAssessmentEvidence } from './assessment.validator.js';
import { prepareAssessmentInputs } from './deterministic-signal.extractor.js';
import { finalizeProficiencyAssessment } from './proficiency.analyzer.js';

const operation = 'learner_assessment';
const promptName = 'learner-assessment';
const promptVersion = '1.0.0';

function determineInputType(inputs) {
  const sources = Object.keys(inputs);
  if (sources.length > 1) return 'combined';
  if (sources[0] === 'projectDescription') return 'project_description';
  if (sources[0] === 'resumeText') return 'resume';
  return 'natural_language';
}

function failureOutcome(error) {
  if (error.code === 'AI_REFUSAL') return 'refusal';
  if (['AI_SCHEMA_VALIDATION_FAILED', 'AI_EVIDENCE_VALIDATION_FAILED'].includes(error.code)) {
    return 'invalid_output';
  }
  return 'provider_error';
}

function safeAssessmentError(error, runId, log) {
  if (error instanceof AppError) return error;
  log.error(
    { errorName: error?.name, errorCode: error?.code, runId },
    'Learner assessment provider call failed',
  );
  return new AppError('Learner assessment failed', {
    status: 502,
    code: 'AI_PROVIDER_ERROR',
  });
}

function usageRecord({ runId, ownerId, prompt, configuration, result, latencyMs, outcome }) {
  const usage = result?.usage ?? {};
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
    inputTokens: usage.inputTokens ?? 0,
    cachedInputTokens: usage.cachedInputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    reasoningTokens: usage.reasoningTokens ?? 0,
    totalTokens: usage.totalTokens ?? 0,
    latencyMs: result?.latencyMs ?? latencyMs,
    outcome,
    providerRequestId: result?.providerRequestId ?? null,
  };
}

export function createAssessmentService({
  flags = featureFlags,
  providerResolver = getConfiguredAiProvider,
  promptLoader = loadPrompt,
  repositories = assessmentRepositories,
  confidenceThreshold = aiConfig.assessmentConfidenceThreshold,
  log = logger,
} = {}) {
  return Object.freeze({
    async assess({ ownerId, requestId, inputs }) {
      const enabled = await flags.isEnabled(reservedFlags.AI_LEARNER_ASSESSMENT, {
        userId: ownerId,
      });
      if (!enabled) {
        throw new AppError('Learner assessment is not enabled', {
          status: 404,
          code: 'AI_ASSESSMENT_DISABLED',
        });
      }

      const prepared = prepareAssessmentInputs(inputs);
      const prompt = await promptLoader(promptName, promptVersion);
      const { provider, configuration } = providerResolver('core');
      const runId = randomUUID();

      await repositories.prompts.ensure(prompt);
      await repositories.runs.create({
        runId,
        ownerId,
        requestId,
        operation,
        inputHash: prepared.inputHash,
        inputType: determineInputType(prepared.inputs),
        mode: 'analysis',
      });

      const startedAt = Date.now();
      let result;
      let assessment;

      try {
        result = await provider.generateStructured({
          model: configuration.model,
          instructions: prompt.content,
          input: JSON.stringify({
            normalizedInputs: prepared.inputs,
            deterministicSignals: prepared.deterministicSignals,
          }),
          schema: getAiSchema('learnerAssessment'),
          schemaName: 'learner_assessment',
          schemaDescription: 'Evidence-grounded analysis of a learner without roadmap content.',
          maxOutputTokens: aiConfig.assessmentMaxOutputTokens,
          metadata: { run_id: runId, operation },
        });

        const validated = validateAiOutput('learnerAssessment', result.data);
        validateAssessmentEvidence(validated, prepared.inputs);
        assessment = finalizeProficiencyAssessment(validated, confidenceThreshold);
      } catch (error) {
        const safeError = safeAssessmentError(error, runId, log);

        try {
          await repositories.usage.record(
            usageRecord({
              runId,
              ownerId,
              prompt,
              configuration,
              result,
              latencyMs: Date.now() - startedAt,
              outcome: failureOutcome(safeError),
            }),
          );
        } catch (usageError) {
          log.error({ err: usageError, runId }, 'Learner assessment usage record failed');
        }

        try {
          await repositories.runs.fail(runId, safeError);
        } catch (runError) {
          log.error({ err: runError, runId }, 'Learner assessment run failure was not recorded');
        }
        throw safeError;
      }

      try {
        await repositories.usage.record(
          usageRecord({
            runId,
            ownerId,
            prompt,
            configuration,
            result,
            latencyMs: Date.now() - startedAt,
            outcome: 'success',
          }),
        );
        await repositories.runs.complete(runId);
      } catch (error) {
        log.error({ err: error, runId }, 'Learner assessment accounting failed');
        const accountingError = new AppError('Learner assessment could not be finalized', {
          status: 500,
          code: 'AI_ASSESSMENT_ACCOUNTING_FAILED',
        });
        try {
          await repositories.runs.fail(runId, accountingError);
        } catch (runError) {
          log.error({ err: runError, runId }, 'Learner assessment run failure was not recorded');
        }
        throw accountingError;
      }

      return Object.freeze({ assessment, runId });
    },
  });
}

export const assessmentService = createAssessmentService();
