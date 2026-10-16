import { createSuccessResponse } from '@tracer-ai/shared/contracts';
import { pipelineIdFrom } from '../accounting/pipeline-id.js';
import { preparationService } from './preparation.service.js';

export const preparationController = Object.freeze({
  async prepare(request, response) {
    const result = await preparationService.prepare({
      ownerId: request.auth?.userId ?? null,
      requestId: request.id,
      pipelineId: pipelineIdFrom(request),
      input: {
        sources: request.body.sources,
        assessmentInputs: request.body.assessmentInputs,
        mode: request.body.mode,
        explicitInput: request.body.explicitInput,
        questionnaire: request.body.questionnaire ?? {},
      },
    });
    response.json(
      createSuccessResponse({
        message: 'Roadmap preparation completed',
        data: {
          pipelineId: result.pipelineId,
          context: result.context,
          sourceUnderstanding: result.sourceUnderstanding ?? null,
          preparation: result.preparation,
        },
        requestId: request.id,
      }),
    );
  },
});
