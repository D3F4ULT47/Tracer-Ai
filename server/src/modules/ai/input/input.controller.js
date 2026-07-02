import { createSuccessResponse } from '@tracer-ai/shared/contracts';
import { inputService } from './input.service.js';

function send(response, request, ingestion) {
  response.json(
    createSuccessResponse({
      message: 'Input ingested',
      data: { ingestion },
      requestId: request.id,
    }),
  );
}

export const inputController = Object.freeze({
  async ingestText(request, response) {
    send(response, request, inputService.ingestText(request.body));
  },

  async ingestResume(request, response) {
    send(
      response,
      request,
      await inputService.ingestResume({
        file: request.file,
        ownerId: request.auth?.userId ?? null,
      }),
    );
  },

  async ingestDocument(request, response) {
    send(
      response,
      request,
      await inputService.ingestDocument({
        file: request.file,
        ownerId: request.auth?.userId ?? null,
      }),
    );
  },
});
