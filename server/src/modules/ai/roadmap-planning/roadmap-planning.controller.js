import { createSuccessResponse } from '@tracer-ai/shared/contracts';
import { roadmapPlanningService } from './roadmap-planning.service.js';

export const roadmapPlanningController = Object.freeze({
  async preview(request, response) {
    const result = await roadmapPlanningService.generate({
      ownerId: request.auth?.userId ?? null,
      requestId: request.id,
      context: request.body.context,
      sourceUnderstanding: request.body.sourceUnderstanding ?? null,
      persist: false,
    });
    response.json(
      createSuccessResponse({
        message: 'Roadmap preview generated',
        data: {
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
      context: request.body.context,
      sourceUnderstanding: request.body.sourceUnderstanding ?? null,
    });

    response.status(201).json(
      createSuccessResponse({
        message: 'Complete roadmap generated',
        data: result,
        requestId: request.id,
      }),
    );
  },
});
