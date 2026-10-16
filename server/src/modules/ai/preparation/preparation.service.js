import { createHash, randomUUID } from 'node:crypto';
import { PREPARATION_OPERATIONS, PREPARATION_STATES } from '@tracer-ai/shared/constants';
import { AI_SCHEMA_VERSION } from '@tracer-ai/shared/schemas/ai';
import {
  featureFlags,
  reservedFlags,
} from '../../../infrastructure/feature-flags/feature-flag-service.js';
import { logger } from '../../../infrastructure/logging/logger.js';
import { AppError } from '../../../shared/app-error.js';
import { buildUsageRecords } from '../accounting/usage-records.js';
import { aiConfig } from '../ai.config.js';
import { assessmentService as defaultAssessmentService } from '../assessment/assessment.service.js';
import { validateAssessmentEvidence } from '../assessment/assessment.validator.js';
import { prepareAssessmentInputs } from '../assessment/deterministic-signal.extractor.js';
import { finalizeProficiencyAssessment } from '../assessment/proficiency.analyzer.js';
import { validateAiOutput } from '../json.validator.js';
import { learningContextService as defaultLearningContextService } from '../learning-context/learning-context.service.js';
import { loadPrompt } from '../prompt.repository.js';
import { DATA_CLASSES } from '../providers/model-chain.js';
import { getConfiguredAiProvider } from '../providers/provider.factory.js';
import {
  ROUTED_SOURCE_PROMPT_VERSION,
  finalizeUnderstanding,
  sourceUnderstandingOutcome,
  sourceUnderstandingService as defaultSourceUnderstandingService,
} from '../source-understanding/source-understanding.service.js';
import { sourceUnderstandingRepository } from '../source-understanding/source-understanding.repository.js';
import { combinedPreparationSchema } from './combined-preparation.schema.js';
import { decidePreparation, isPlanningSource } from './preparation-router.js';
import { SOURCE_EXCERPT_CHARACTERS } from './source-context.js';

const { REQUIRED, ALREADY_AVAILABLE, FAILED } = PREPARATION_STATES;
const combinedOperation = PREPARATION_OPERATIONS.COMBINED_PREPARATION;
const nonRetryableRetrieval = /NOT_FOUND|PRIVATE|INVALID|UNSUPPORTED|FORBIDDEN|TOO_LARGE/;

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function identifierOf(source) {
  return source.url ?? source.title ?? source.metadata?.fileName ?? null;
}

function safeCode(error, fallback) {
  return error instanceof AppError ? error.code : fallback;
}

function combinedOutcome(error) {
  return error?.code === 'AI_EVIDENCE_VALIDATION_FAILED'
    ? 'invalid_output'
    : sourceUnderstandingOutcome(error);
}

function dataClassForAssessment(assessmentInputs) {
  return assessmentInputs?.resumeText ? DATA_CLASSES.PERSONAL : DATA_CLASSES.GENERAL;
}

/**
 * Per-source retrieval and understanding status (RFC 0001 section 8.1).
 */
function understandingStatus(state) {
  if (state === REQUIRED || state === ALREADY_AVAILABLE) return 'understood';
  return state === FAILED ? 'understanding_failed' : 'not_required';
}

function sourceStatuses({ sources, normalized, sourceState, learnerState }) {
  const planning = sources.filter(isPlanningSource);
  const planningStatuses = planning.map((source, index) => {
    const processing = normalized?.sourceProcessing[index];
    const base = {
      sourceType: source.type,
      identifier: processing?.identifier ?? identifierOf(source),
      errorCode: null,
      retryable: false,
    };
    if (processing?.status === 'failed') {
      return {
        ...base,
        retrievalStatus: 'retrieval_failed',
        understandingStatus: 'not_required',
        errorCode: processing.errorCode,
        retryable: !nonRetryableRetrieval.test(processing.errorCode),
      };
    }
    if (source.type === 'natural_prompt') {
      return { ...base, retrievalStatus: 'not_applicable', understandingStatus: 'not_required' };
    }
    return {
      ...base,
      retrievalStatus: processing ? 'retrieved' : 'not_applicable',
      understandingStatus: understandingStatus(sourceState),
    };
  });
  const learnerStatuses = sources
    .filter((source) => !isPlanningSource(source))
    .map((source) => ({
      sourceType: source.type,
      identifier: identifierOf(source),
      errorCode: null,
      retryable: false,
      retrievalStatus: 'retrieved',
      understandingStatus: understandingStatus(learnerState),
    }));
  return [...planningStatuses, ...learnerStatuses];
}

function notices(statuses, { sourceState, learnerState }) {
  const messages = [];
  for (const status of statuses) {
    const label = status.identifier ?? status.sourceType;
    if (status.retrievalStatus === 'retrieval_failed') {
      messages.push(
        `We couldn't access ${label} (${status.errorCode}). This roadmap was built without it.`,
      );
    } else if (
      status.understandingStatus === 'understanding_failed' &&
      status.sourceType !== 'resume'
    ) {
      messages.push(
        `We read ${label} but couldn't fully analyse it; the roadmap uses an excerpt of it.`,
      );
    }
  }
  if (learnerState === FAILED) {
    messages.push(
      "We couldn't analyse your background; the roadmap assumes a beginner-to-intermediate level.",
    );
  }
  if (sourceState === FAILED && messages.length === 0) {
    messages.push("We couldn't analyse your sources; the roadmap is based on your goal text.");
  }
  return messages;
}

export function createPreparationService({
  flags = featureFlags,
  sourceUnderstanding = defaultSourceUnderstandingService,
  assessment = defaultAssessmentService,
  learningContext = defaultLearningContextService,
  providerResolver = getConfiguredAiProvider,
  promptLoader = loadPrompt,
  repositories = sourceUnderstandingRepository,
  confidenceThreshold = aiConfig.assessmentConfidenceThreshold,
  log = logger,
} = {}) {
  async function combinedPreparation({
    ownerId,
    requestId,
    pipelineId,
    normalized,
    assessmentInputs,
    learner,
  }) {
    const prepared = prepareAssessmentInputs(assessmentInputs);
    const prompt = await promptLoader('preparation-combined', '1.0.0');
    const { provider, configuration } = providerResolver('fast', {
      operation: combinedOperation,
      dataClass: dataClassForAssessment(assessmentInputs),
      reuse: { scope: learner, cacheTtlSeconds: aiConfig.reuse.ownerTtlSeconds },
    });
    const runId = randomUUID();
    const startedAt = Date.now();
    const finalize = (data) => {
      const understanding = finalizeUnderstanding(
        data.sourceUnderstanding,
        normalized,
        ROUTED_SOURCE_PROMPT_VERSION,
      );
      const validated = validateAiOutput('learnerAssessment', data.learnerAssessment);
      validateAssessmentEvidence(validated, prepared.inputs);
      return {
        understanding,
        assessment: finalizeProficiencyAssessment(validated, confidenceThreshold),
      };
    };
    const recordUsage = (fields) =>
      Promise.all(
        buildUsageRecords({
          runId,
          ownerId,
          pipelineId,
          operation: combinedOperation,
          prompt,
          outputSchemaVersion: AI_SCHEMA_VERSION,
          configuration,
          latencyMs: Date.now() - startedAt,
          failureOutcome: combinedOutcome,
          ...fields,
        }).map((record) => repositories.usage.record(record)),
      );

    await repositories.prompts.ensure(prompt);
    await repositories.runs.create({
      runId,
      ownerId,
      requestId,
      pipelineId,
      operation: combinedOperation,
      inputHash: hash({
        sources: normalized.sources.map(({ contentHash, type }) => ({ contentHash, type })),
        learner: prepared.inputHash,
      }),
      inputType: 'combined',
      mode: 'analysis',
    });

    let result;
    try {
      result = await provider.generateStructured({
        model: configuration.model,
        instructions: prompt.content,
        input: JSON.stringify({
          sources: normalized.sources,
          learner: {
            normalizedInputs: prepared.inputs,
            deterministicSignals: prepared.deterministicSignals,
          },
        }),
        schema: combinedPreparationSchema(),
        schemaName: 'combined_preparation',
        schemaDescription:
          'Independent source understanding and learner assessment for roadmap preparation.',
        maxOutputTokens:
          aiConfig.sourceUnderstandingMaxOutputTokens + aiConfig.assessmentMaxOutputTokens,
        metadata: { run_id: runId, operation: combinedOperation },
        validate: finalize,
      });
      const finalized = finalize(result.data);
      await recordUsage({ result, outcome: 'success' });
      await repositories.runs.complete(runId);
      return finalized;
    } catch (error) {
      try {
        await recordUsage({ result, error, outcome: combinedOutcome(error) });
        await repositories.runs.fail(runId, error);
      } catch (accountingError) {
        log.error({ err: accountingError, runId }, 'Combined preparation accounting failed');
      }
      throw error;
    }
  }

  async function buildContext({
    ownerId,
    assessmentResult,
    mode,
    explicitInput,
    questionnaire,
    applyDefault,
  }) {
    return learningContext.create({
      ownerId,
      assessment: assessmentResult,
      mode,
      explicitInput,
      questionnaire,
      sourceVersions: assessmentResult
        ? { assessmentVersion: assessmentResult.schemaVersion }
        : undefined,
      applyUnknownLevelDefault: applyDefault,
    });
  }

  async function prepareLegacy({ ownerId, requestId, pipelineId, input, learner }) {
    const understood = await sourceUnderstanding.understand({
      ownerId,
      requestId,
      pipelineId,
      sources: input.sources,
      learner,
    });
    const assessed = await assessment.assess({
      ownerId,
      requestId,
      pipelineId,
      inputs: input.assessmentInputs,
      learner,
    });
    const context = await buildContext({
      ownerId,
      assessmentResult: assessed.assessment,
      mode: input.mode,
      explicitInput: input.explicitInput,
      questionnaire: input.questionnaire,
      applyDefault: false,
    });
    const statuses = understood.understanding.sourceProcessing.map((processing) => ({
      sourceType: processing.sourceType,
      identifier: processing.identifier,
      retrievalStatus: processing.status === 'processed' ? 'retrieved' : 'retrieval_failed',
      understandingStatus: processing.status === 'processed' ? 'understood' : 'not_required',
      errorCode: processing.errorCode,
      retryable:
        processing.status === 'failed' && !nonRetryableRetrieval.test(processing.errorCode ?? ''),
    }));
    return {
      context,
      sourceUnderstanding: understood.understanding,
      preparation: {
        pipelineId,
        pipelineVersion: 'legacy',
        case: null,
        sourceUnderstanding: { state: REQUIRED, reason: 'legacy pipeline always runs it' },
        learnerAssessment: { state: REQUIRED, reason: 'legacy pipeline always runs it' },
        operations: [
          PREPARATION_OPERATIONS.SOURCE_UNDERSTANDING,
          PREPARATION_OPERATIONS.LEARNER_ASSESSMENT,
        ],
        expectedCalls: 3,
        sourceStatuses: statuses,
        sourceExcerpts: [],
        degraded: false,
        notices: notices(statuses, { sourceState: REQUIRED, learnerState: REQUIRED }),
      },
    };
  }

  async function prepareRouted({ ownerId, requestId, pipelineId, input, learner }) {
    const assessmentEnabled = await flags.isEnabled(reservedFlags.AI_LEARNER_ASSESSMENT, {
      userId: ownerId,
    });
    const decision = decidePreparation({
      sources: input.sources,
      assessmentInputs: input.assessmentInputs,
      explicitInput: input.explicitInput,
      questionnaire: input.questionnaire,
      prior: input.prior,
      assessmentEnabled,
    });
    let sourceState = decision.sourceUnderstanding.state;
    let learnerState = decision.learnerAssessment.state;
    const errors = {};
    let understanding = sourceState === ALREADY_AVAILABLE ? input.prior.understanding : null;
    let assessmentResult = null;
    let normalized = null;
    const executedOperations = [];

    if (sourceState === REQUIRED) {
      normalized = await sourceUnderstanding.normalize(input.sources.filter(isPlanningSource));
      const hasContent = normalized.sources.some((source) => source.type !== 'natural_prompt');
      if (!hasContent) {
        sourceState = FAILED;
        errors.sourceUnderstanding = 'ALL_PLANNING_SOURCES_UNAVAILABLE';
      }
    }
    if (sourceState === FAILED && !input.explicitInput?.primaryGoal?.trim()) {
      throw new AppError('None of the supplied sources could be read and no goal text was given', {
        status: 422,
        code: 'PREPARATION_NO_USABLE_INPUT',
        details: {
          sourceStatuses: sourceStatuses({
            sources: input.sources,
            normalized,
            sourceState,
            learnerState,
          }),
        },
      });
    }

    const runSource = sourceState === REQUIRED;
    const runLearner = learnerState === REQUIRED;
    if (runSource && runLearner) {
      executedOperations.push(combinedOperation);
      try {
        const combined = await combinedPreparation({
          ownerId,
          requestId,
          pipelineId,
          normalized,
          assessmentInputs: input.assessmentInputs,
          learner,
        });
        understanding = combined.understanding;
        assessmentResult = combined.assessment;
      } catch (error) {
        sourceState = FAILED;
        learnerState = FAILED;
        errors.sourceUnderstanding = safeCode(error, 'PREPARATION_FAILED');
        errors.learnerAssessment = errors.sourceUnderstanding;
      }
    } else if (runSource) {
      executedOperations.push(PREPARATION_OPERATIONS.SOURCE_UNDERSTANDING);
      try {
        const result = await sourceUnderstanding.understandNormalized({
          normalized,
          ownerId,
          requestId,
          pipelineId,
          profile: 'fast',
          promptVersion: ROUTED_SOURCE_PROMPT_VERSION,
          learner,
        });
        understanding = result.understanding;
      } catch (error) {
        sourceState = FAILED;
        errors.sourceUnderstanding = safeCode(error, 'SOURCE_UNDERSTANDING_FAILED');
      }
    } else if (runLearner) {
      executedOperations.push(PREPARATION_OPERATIONS.LEARNER_ASSESSMENT);
      try {
        const result = await assessment.assess({
          ownerId,
          requestId,
          pipelineId,
          inputs: input.assessmentInputs,
          profile: 'fast',
          learner,
        });
        assessmentResult = result.assessment;
      } catch (error) {
        learnerState = FAILED;
        errors.learnerAssessment = safeCode(error, 'LEARNER_ASSESSMENT_FAILED');
      }
    }

    const context = await buildContext({
      ownerId,
      assessmentResult,
      mode: input.mode,
      explicitInput: input.explicitInput,
      questionnaire: input.questionnaire,
      applyDefault: true,
    });
    const statuses = sourceStatuses({
      sources: input.sources,
      normalized,
      sourceState,
      learnerState,
    });
    const sourceExcerpts =
      sourceState === FAILED && normalized
        ? normalized.sources
            .filter((source) => source.type !== 'natural_prompt')
            .map((source) => ({
              sourceType: source.type,
              identifier: identifierOf(source),
              excerpt: source.content.slice(0, SOURCE_EXCERPT_CHARACTERS),
            }))
        : [];
    const degraded =
      sourceState === FAILED ||
      learnerState === FAILED ||
      statuses.some(({ retrievalStatus }) => retrievalStatus === 'retrieval_failed');
    const preparation = {
      pipelineId,
      pipelineVersion: 'routed',
      routerVersion: decision.routerVersion,
      case: decision.case,
      sourceUnderstanding: {
        ...decision.sourceUnderstanding,
        state: sourceState,
        ...(errors.sourceUnderstanding ? { errorCode: errors.sourceUnderstanding } : {}),
      },
      learnerAssessment: {
        ...decision.learnerAssessment,
        state: learnerState,
        ...(errors.learnerAssessment ? { errorCode: errors.learnerAssessment } : {}),
      },
      operations: decision.operations,
      executedOperations,
      expectedCalls: decision.expectedCalls,
      inputKey: decision.inputKey,
      sourceStatuses: statuses,
      sourceExcerpts,
      degraded,
      notices: notices(statuses, { sourceState, learnerState }),
    };
    log.info(
      {
        pipelineId,
        case: decision.case,
        sourceState,
        learnerState,
        executedOperations,
        degraded,
      },
      'Roadmap preparation routed',
    );
    return { context, sourceUnderstanding: understanding, preparation };
  }

  return Object.freeze({
    async prepare({ ownerId, requestId, pipelineId, input, learner = null }) {
      const resolvedPipelineId = pipelineId ?? randomUUID();
      const routed = await flags.isEnabled(reservedFlags.AI_ROUTED_PREPARATION, {
        userId: ownerId,
      });
      const prepared = routed
        ? await prepareRouted({
            ownerId,
            requestId,
            pipelineId: resolvedPipelineId,
            input,
            learner,
          })
        : await prepareLegacy({
            ownerId,
            requestId,
            pipelineId: resolvedPipelineId,
            input,
            learner,
          });
      return Object.freeze({ pipelineId: resolvedPipelineId, ...prepared });
    },
  });
}

export const preparationService = createPreparationService();
