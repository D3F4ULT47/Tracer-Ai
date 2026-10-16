import { createHash, randomUUID } from 'node:crypto';
import { AI_SCHEMA_VERSION, getAiSchema } from '@tracer-ai/shared/schemas/ai';
import {
  featureFlags,
  reservedFlags,
} from '../../../infrastructure/feature-flags/feature-flag-service.js';
import { logger } from '../../../infrastructure/logging/logger.js';
import { AppError } from '../../../shared/app-error.js';
import { createActivityEvent } from '../../activity/index.js';
import { roadmapResourceEnrichmentService } from '../../resources/index.js';
import { buildUsageRecords } from '../accounting/usage-records.js';
import { aiConfig } from '../ai.config.js';
import { clarificationService } from '../clarification/clarification.service.js';
import { validateAiOutput } from '../json.validator.js';
import { loadPrompt } from '../prompt.repository.js';
import { getConfiguredAiProvider } from '../providers/provider.factory.js';
import { roadmapPlanningRepository } from './roadmap-planning.repository.js';
import { validateAndRepairRoadmapGeneration } from './roadmap-planning.validator.js';

const operation = 'roadmap_generation';
const promptName = 'roadmap-generation';
const promptVersion = '1.0.0';

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function providerGenerationSchema() {
  const schema = structuredClone(getAiSchema('roadmapGeneration'));
  const roadmap = structuredClone(getAiSchema('roadmap'));
  const dependencyGraph = structuredClone(getAiSchema('dependencyGraph'));
  delete roadmap.$schema;
  delete roadmap.$id;
  delete dependencyGraph.$schema;
  delete dependencyGraph.$id;

  const roadmapDefinitions = roadmap.$defs;
  roadmapDefinitions.task.properties.resources = {
    type: 'array',
    maxItems: 0,
    items: { type: 'string' },
  };
  delete roadmapDefinitions.task.properties.attachments;
  delete roadmap.$defs;
  schema.$defs = roadmapDefinitions;
  schema.properties.roadmap = roadmap;
  schema.properties.dependencyGraph = dependencyGraph;
  return schema;
}

function legacyInputType(context) {
  if (context.generatedFrom.resumeVersion !== null) return 'resume';
  if (context.goalType.value === 'project') return 'project_description';
  return 'natural_language';
}

function generationInputType(context, sourceUnderstanding) {
  const sourceTypes = sourceUnderstanding?.sourceAttributions?.map((source) => source.sourceType);
  if (!sourceTypes?.length) return legacyInputType(context);
  if (sourceTypes.length > 1) return 'combined';
  return sourceTypes[0];
}

function failureOutcome(error) {
  if (error.code === 'AI_REFUSAL') return 'refusal';
  if (['AI_SCHEMA_VALIDATION_FAILED', 'ROADMAP_SEMANTIC_VALIDATION_FAILED'].includes(error.code)) {
    return 'invalid_output';
  }
  return 'provider_error';
}

function safePlanningError(error, runId, log) {
  if (error instanceof AppError) return error;
  log.error(
    { errorName: error?.name, errorCode: error?.code, runId },
    'Roadmap planning provider call failed',
  );
  return new AppError('Roadmap generation failed', {
    status: 502,
    code: 'AI_PROVIDER_ERROR',
  });
}

function recordUsage(repositories, fields) {
  return Promise.all(
    buildUsageRecords({
      operation,
      outputSchemaVersion: AI_SCHEMA_VERSION,
      failureOutcome,
      ...fields,
    }).map((record) => repositories.usage.record(record)),
  );
}

function persistenceBundle({
  ownerId,
  roadmapId,
  runId,
  context,
  prompt,
  result,
  generation,
  validation,
  generatedAt,
  sourceUnderstanding,
  resourceEnrichment,
  preparation = null,
  anonymousSessionId = null,
}) {
  const roadmap = generation.roadmap;
  const snapshotHash = hash(roadmap);
  const common = { roadmapId, ownerId, anonymousSessionId };
  const {
    sourceStatuses = [],
    sourceExcerpts,
    notices,
    ...preparationDecision
  } = preparation ?? {};
  void sourceExcerpts;
  void notices;

  return {
    context: {
      ...common,
      contextVersion: context.contextVersion,
      contextHash: hash(context),
      learningContext: context,
      sourceUnderstanding,
      sourceAttributions: sourceUnderstanding?.sourceAttributions ?? [],
      preparationDecision: preparation ? preparationDecision : null,
      sourceStatuses,
    },
    roadmap: {
      ...common,
      currentVersion: 1,
      type: roadmap.type,
      title: roadmap.title,
      description: roadmap.description,
      summary: roadmap.summary,
      estimatedWeeks: roadmap.estimatedWeeks,
      currentLevel: roadmap.currentLevel,
      weeklyCommitmentHours: roadmap.weeklyCommitmentHours,
      missingSkills: roadmap.missingSkills,
      aiConfidence: roadmap.confidence,
      difficulty: roadmap.difficulty,
      completionCriteria: roadmap.completionCriteria,
      phases: roadmap.phases,
    },
    generation: {
      ...common,
      runId,
      provider: result.provider,
      model: result.model,
      prompt: { name: prompt.name, version: prompt.version, hash: prompt.hash },
      outputSchemaVersion: '1.0.0',
      generationParameters: {
        mode: 'single_pass',
        maxOutputTokens: aiConfig.roadmapMaxOutputTokens,
        resourceEnrichment,
      },
      validation,
      planningGraph: generation.dependencyGraph,
      generationTimeMs: result.latencyMs,
      createdRoadmapVersion: 1,
    },
    version: {
      ...common,
      version: 1,
      source: 'initial_generation',
      snapshot: roadmap,
      planningGraphSnapshot: generation.dependencyGraph,
      snapshotHash,
      promptVersion: prompt.version,
      model: result.model,
      generatedAt,
      learningContextVersion: context.contextVersion,
      editorId: ownerId,
      changeSummary: 'Initial AI roadmap generation',
    },
    activity: createActivityEvent({
      userId: ownerId,
      roadmapId,
      roadmapTitle: roadmap.title,
      roadmapVersion: 1,
      runId,
      activityType: 'ROADMAP_CREATED',
      shortDescription: `Created ${roadmap.title}.`,
      timestamp: generatedAt,
      metadata: { contextVersion: context.contextVersion, promptVersion: prompt.version },
      anonymousSessionId,
    }),
  };
}

export function createRoadmapPlanningService({
  flags = featureFlags,
  providerResolver = getConfiguredAiProvider,
  promptLoader = loadPrompt,
  repositories = roadmapPlanningRepository,
  clarification = clarificationService,
  enrichment = roadmapResourceEnrichmentService,
  log = logger,
} = {}) {
  return Object.freeze({
    async generate({
      ownerId,
      requestId,
      context,
      sourceUnderstanding = null,
      preparation = null,
      persist = true,
      anonymousSessionId = null,
      pipelineId = null,
      onProgress,
    }) {
      let activeStage = 'roadmap_planning';
      const report = (stage, status = 'active') => {
        activeStage = stage;
        onProgress?.(stage, status);
      };
      validateAiOutput('learningContext', context);
      if (sourceUnderstanding) validateAiOutput('sourceUnderstanding', sourceUnderstanding);
      const clarificationDecision = clarification.decide(context);
      if (clarificationDecision.clarificationRequired && context.mode.value !== 'quick') {
        throw new AppError('Learning Context requires clarification before roadmap generation', {
          status: 409,
          code: 'LEARNING_CONTEXT_REQUIRES_CLARIFICATION',
          details: { selectedQuestion: clarificationDecision.selectedQuestion },
        });
      }

      const enabled = await flags.isEnabled(reservedFlags.AI_ROADMAP_GENERATION, {
        userId: ownerId,
      });
      if (!enabled) {
        throw new AppError('Roadmap generation is not enabled', {
          status: 404,
          code: 'AI_ROADMAP_GENERATION_DISABLED',
        });
      }

      const prompt = await promptLoader(promptName, promptVersion);
      const { provider, configuration } = providerResolver('core', { operation });
      const runId = randomUUID();
      const roadmapId = randomUUID();

      await repositories.prompts.ensure(prompt);
      await repositories.runs.create({
        runId,
        ownerId,
        requestId,
        pipelineId,
        operation,
        inputHash: hash({ context, sourceUnderstanding }),
        inputType: generationInputType(context, sourceUnderstanding),
        mode: context.mode.value,
      });

      const startedAt = Date.now();
      let result;
      let planned;
      try {
        report('roadmap_planning');
        result = await provider.generateStructured({
          model: configuration.model,
          instructions: prompt.content,
          input: JSON.stringify({
            learningContext: context,
            ...(sourceUnderstanding ? { sourceUnderstanding } : {}),
          }),
          schema: providerGenerationSchema(),
          schemaName: 'complete_roadmap_plan',
          schemaDescription:
            'One complete editable roadmap and its internal dependency graph, generated together.',
          maxOutputTokens: aiConfig.roadmapMaxOutputTokens,
          metadata: { run_id: runId, operation },
        });
        report('roadmap_validation');
        planned = validateAndRepairRoadmapGeneration(result.data);
      } catch (error) {
        report(activeStage, 'failed');
        const safeError = safePlanningError(error, runId, log);
        try {
          await recordUsage(repositories, {
            runId,
            ownerId,
            pipelineId,
            prompt,
            configuration,
            result,
            error,
            latencyMs: Date.now() - startedAt,
            outcome: failureOutcome(safeError),
          });
          await repositories.runs.fail(runId, safeError);
        } catch (accountingError) {
          log.error({ err: accountingError, runId }, 'Roadmap failure accounting failed');
        }
        throw safeError;
      }

      let generation = planned.generation;
      const shouldPersist = persist || Boolean(anonymousSessionId);
      let resourceEnrichment = {
        taskCount: generation.roadmap.phases.flatMap((phase) =>
          phase.weeks.flatMap((week) => week.tasks),
        ).length,
        enrichedTaskCount: 0,
        attachmentCount: 0,
        partial: true,
      };
      try {
        report('resource_discovery');
        const enriched = await enrichment.enrich({
          learningContext: context,
          roadmap: generation.roadmap,
          onProgress: report,
        });
        validateAiOutput('roadmap', enriched.roadmap);
        generation = { ...generation, roadmap: enriched.roadmap };
        resourceEnrichment = enriched.diagnostics;
      } catch (error) {
        log.warn(
          { errorCode: error?.code ?? 'RESOURCE_ENRICHMENT_FAILED', runId },
          'Roadmap generated without automatic resource enrichment',
        );
      }

      const generatedAt = new Date();
      try {
        await recordUsage(repositories, {
          runId,
          ownerId,
          pipelineId,
          prompt,
          configuration,
          result,
          latencyMs: Date.now() - startedAt,
          outcome: 'success',
        });
        report('persistence');
        if (shouldPersist) {
          await repositories.persistInitialGeneration(
            persistenceBundle({
              ownerId,
              roadmapId,
              runId,
              context,
              prompt,
              result,
              generation,
              validation: planned.validation,
              generatedAt,
              sourceUnderstanding,
              resourceEnrichment,
              preparation,
              anonymousSessionId,
            }),
          );
        }
        const roadmap = generation.roadmap;
        await repositories.runs.complete(runId, shouldPersist ? roadmapId : null, {
          detectedLevel: roadmap.currentLevel,
          estimatedWeeks: roadmap.estimatedWeeks,
          missingSkills: roadmap.missingSkills,
          weeklyCommitmentHours: roadmap.weeklyCommitmentHours,
          confidence: roadmap.confidence,
        });
        report('workspace_ready');
      } catch (error) {
        report(activeStage, 'failed');
        const safeError = new AppError('Roadmap generation could not be persisted', {
          status: 500,
          code: 'ROADMAP_PERSISTENCE_FAILED',
        });
        log.error({ err: error, runId }, 'Roadmap persistence failed');
        try {
          await repositories.runs.fail(runId, safeError);
        } catch (runError) {
          log.error({ err: runError, runId }, 'Roadmap run failure was not recorded');
        }
        throw safeError;
      }

      return Object.freeze({
        roadmapId: shouldPersist ? roadmapId : null,
        version: shouldPersist ? 1 : 0,
        ...(anonymousSessionId ? { anonymousSessionId } : {}),
        roadmap: generation.roadmap,
        generationMetadata: Object.freeze({
          runId,
          schemaVersion: '2.0.0',
          promptVersion: prompt.version,
          model: result.model,
          generatedAt: generatedAt.toISOString(),
          generationTimeMs: result.latencyMs,
          learningContextVersion: context.contextVersion,
          ...(preparation
            ? {
                pipelineVersion: preparation.pipelineVersion,
                degraded: preparation.degraded,
                warnings: preparation.notices ?? [],
              }
            : {}),
        }),
      });
    },
  });
}

export const roadmapPlanningService = createRoadmapPlanningService();
