import { createSuccessResponse } from '@tracer-ai/shared/contracts';
import { clarificationService } from './clarification.service.js';

function send(response, request, message, data) {
  response.json(createSuccessResponse({ message, data, requestId: request.id }));
}

export const clarificationController = Object.freeze({
  decide(request, response) {
    send(response, request, 'Clarification decision created', {
      decision: clarificationService.decide(request.body.context),
    });
  },
  respond(request, response) {
    send(
      response,
      request,
      'Clarification response applied',
      clarificationService.respond(request.body),
    );
  },
});
