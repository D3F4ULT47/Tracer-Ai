import { createSuccessResponse } from '@tracer-ai/shared/contracts';
import { pipelineIdFrom } from '../accounting/pipeline-id.js';
import { generationProgressService } from './generation-progress.service.js';
import { roadmapPlanningService } from './roadmap-planning.service.js';

export const roadmapPlanningController = Object.freeze({
  async preview(request, response) {
    const result = await roadmapPlanningService.generate({
      ownerId: request.auth?.userId ?? null,
      requestId: request.id,
      pipelineId: pipelineIdFrom(request),
      context: request.body.context,
      sourceUnderstanding: request.body.sourceUnderstanding ?? null,
      preparation: request.body.preparation ?? null,
      persist: false,
      anonymousSessionId: request.body.anonymousSessionId,
      onProgress: request.body.generationSessionId
        ? (stage, status) =>
            generationProgressService.update(request.body.generationSessionId, stage, status)
        : undefined,
    });
    response.json(
      createSuccessResponse({
        message: 'Roadmap preview generated',
        data: {
          roadmapId: result.roadmapId,
          version: result.version,
          anonymousSessionId: result.anonymousSessionId,
          roadmap: result.roadmap,
          generationMetadata: result.generationMetadata,
        },
        requestId: request.id,
      }),
    );
  },

  async generate(request, response) {
    const result = await roadmapPlanningService.generate({
      ownerId: request.auth.userId,
      requestId: request.id,
      pipelineId: pipelineIdFrom(request),
      context: request.body.context,
      sourceUnderstanding: request.body.sourceUnderstanding ?? null,
      preparation: request.body.preparation ?? null,
      onProgress: request.body.generationSessionId
        ? (stage, status) =>
            generationProgressService.update(request.body.generationSessionId, stage, status)
        : undefined,
    });

    response.status(201).json(
      createSuccessResponse({
        message: 'Complete roadmap generated',
        data: result,
        requestId: request.id,
      }),
    );
  },

  async progress(request, response) {
    response.json(
      createSuccessResponse({
        message: 'Generation progress retrieved',
        data: await generationProgressService.read(request.params.sessionId),
        requestId: request.id,
      }),
    );
  },
});
