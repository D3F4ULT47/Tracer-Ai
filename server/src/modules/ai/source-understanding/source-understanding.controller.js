import { createSuccessResponse } from '@tracer-ai/shared/contracts';
import { pipelineIdFrom } from '../accounting/pipeline-id.js';
import { sourceUnderstandingService } from './source-understanding.service.js';

export const sourceUnderstandingController = Object.freeze({
  async create(request, response) {
    const result = await sourceUnderstandingService.understand({
      ownerId: request.auth?.userId ?? null,
      requestId: request.id,
      pipelineId: pipelineIdFrom(request),
      sources: request.body.sources,
    });
    response.json(
      createSuccessResponse({
        message: 'Roadmap sources understood',
        data: result,
        requestId: request.id,
      }),
    );
  },
});
