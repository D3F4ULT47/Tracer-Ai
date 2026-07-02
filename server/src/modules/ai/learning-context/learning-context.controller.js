import { createSuccessResponse } from '@tracer-ai/shared/contracts';
import { learningContextService } from './learning-context.service.js';

export const learningContextController = Object.freeze({
  async create(request, response) {
    const context = await learningContextService.create({
      ownerId: request.auth?.userId ?? null,
      assessment: request.body.assessment,
      mode: request.body.mode,
      explicitInput: request.body.explicitInput,
      questionnaire: request.body.questionnaire,
      resumeAnalysis: request.body.resumeAnalysis,
      sourceVersions: request.body.sourceVersions,
    });
    response.json(
      createSuccessResponse({
        message: 'Learning Context created',
        data: { context },
        requestId: request.id,
      }),
    );
  },
});
