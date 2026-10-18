import { randomUUID } from 'node:crypto';
import { AI_SCHEMA_VERSION, getAiSchema } from '@tracer-ai/shared/schemas/ai';
import {
  featureFlags,
  reservedFlags,
} from '../../../infrastructure/feature-flags/feature-flag-service.js';
import { logger } from '../../../infrastructure/logging/logger.js';
import { AppError } from '../../../shared/app-error.js';
import { buildUsageRecords } from '../accounting/usage-records.js';
import { aiConfig } from '../ai.config.js';
import { validateAiOutput } from '../json.validator.js';
import { loadPrompt } from '../prompt.repository.js';
import { DATA_CLASSES } from '../providers/model-chain.js';
import { getConfiguredAiProvider } from '../providers/provider.factory.js';
import { assessmentRepositories } from './assessment.repository.js';
import { validateAssessmentEvidence } from './assessment.validator.js';
import { prepareAssessmentInputs } from './deterministic-signal.extractor.js';
import { finalizeProficiencyAssessment } from './proficiency.analyzer.js';

const operation = 'learner_assessment';
const promptName = 'learner-assessment';
const promptVersions = Object.freeze({ core: '1.0.0', fast: '1.1.0' });

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

export function dataClassForAssessmentInputs(inputs) {
  return inputs?.resumeText ? DATA_CLASSES.PERSONAL : DATA_CLASSES.GENERAL;
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
    async assess({
      ownerId,
      requestId,
      inputs,
      pipelineId = null,
      profile = 'core',
      learner = null,
    }) {
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
      const prompt = await promptLoader(promptName, promptVersions[profile] ?? promptVersions.core);
      const { provider, configuration } = providerResolver(profile, {
        operation,
        dataClass: dataClassForAssessmentInputs(prepared.inputs),
        reuse: { scope: learner, cacheTtlSeconds: aiConfig.reuse.ownerTtlSeconds },
      });
      const runId = randomUUID();
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
            failureOutcome,
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
          validate: (data) =>
            validateAssessmentEvidence(
              validateAiOutput('learnerAssessment', data),
              prepared.inputs,
            ),
        });

        const validated = validateAiOutput('learnerAssessment', result.data);
        validateAssessmentEvidence(validated, prepared.inputs);
        assessment = finalizeProficiencyAssessment(validated, confidenceThreshold);
      } catch (error) {
        const safeError = safeAssessmentError(error, runId, log);

        try {
          await recordUsage({ result, error, outcome: failureOutcome(safeError) });
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
        await recordUsage({ result, outcome: 'success' });
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
