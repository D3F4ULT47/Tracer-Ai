import { createSuccessResponse } from '@tracer-ai/shared/contracts';
import { pipelineIdFrom } from '../accounting/pipeline-id.js';
import { requestScope } from '../reuse/reuse-scope.js';
import { assessmentService } from './assessment.service.js';

export const assessmentController = Object.freeze({
  async create(request, response) {
    const result = await assessmentService.assess({
      ownerId: request.auth?.userId ?? null,
      requestId: request.id,
      pipelineId: pipelineIdFrom(request),
      inputs: request.body.inputs,
      learner: requestScope(request),
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
