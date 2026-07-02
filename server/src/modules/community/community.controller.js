import { createSuccessResponse } from '@tracer-ai/shared/contracts';
import { communityService } from './community.service.js';

export const communityController = Object.freeze({
  async feed(request, response) {
    response.json(
      createSuccessResponse({
        message: 'Community feed loaded',
        data: await communityService.feed(),
        requestId: request.id,
      }),
    );
  },
});
