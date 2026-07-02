import { createSuccessResponse } from '@tracer-ai/shared/contracts';
import { assessmentService } from './assessment.service.js';

export const assessmentController = Object.freeze({
  async create(request, response) {
    const result = await assessmentService.assess({
      ownerId: request.auth?.userId ?? null,
      requestId: request.id,
      inputs: request.body.inputs,
    });

    response.json(
      createSuccessResponse({
        message: 'Learner assessment created',
        data: result,
        requestId: request.id,
      }),
    );
  },
});
