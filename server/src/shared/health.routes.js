import {
  API_ERROR_CODES,
  createErrorResponse,
  createSuccessResponse,
} from '@tracer-ai/shared/contracts';
import { Router } from 'express';
import { getLivenessSnapshot, getReadinessSnapshot } from './health.service.js';

export const healthRouter = Router();

healthRouter.get('/live', (request, response) => {
  response.json(
    createSuccessResponse({
      message: 'Service is live',
      data: getLivenessSnapshot(),
      requestId: request.id,
    }),
  );
});

healthRouter.get('/ready', (request, response) => {
  const readiness = getReadinessSnapshot();

  if (readiness.status !== 'ready') {
    response.status(503).json(
      createErrorResponse({
        message: 'Service dependencies are not ready',
        code: API_ERROR_CODES.NOT_READY,
        details: readiness,
        requestId: request.id,
      }),
    );
    return;
  }

  response.json(
    createSuccessResponse({
      message: 'Service is ready',
      data: readiness,
      requestId: request.id,
    }),
  );
});
