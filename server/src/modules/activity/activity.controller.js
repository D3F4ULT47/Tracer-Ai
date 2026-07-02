import { createSuccessResponse } from '@tracer-ai/shared/contracts';
import { activityService } from './activity.service.js';

export const activityController = Object.freeze({
  async list(request, response) {
    response.json(
      createSuccessResponse({
        message: 'Recent activity loaded',
        data: await activityService.list(request.auth.userId, request.query),
        requestId: request.id,
      }),
    );
  },
});
