import { API_ERROR_CODES, createErrorResponse } from '@tracer-ai/shared/contracts';
import { logger } from '../infrastructure/logging/logger.js';

export function notFoundHandler(request, response) {
  response.status(404).json(
    createErrorResponse({
      message: 'Route not found',
      code: API_ERROR_CODES.NOT_FOUND,
      requestId: request.id,
    }),
  );
}

export function errorHandler(error, request, response, _next) {
  void _next;
  const status = Number.isInteger(error.status) ? error.status : 500;
  const code = error.code ?? API_ERROR_CODES.INTERNAL_ERROR;

  if (status >= 500) logger.error({ err: error, requestId: request.id }, 'Unhandled request error');
  else logger.warn({ code, requestId: request.id }, 'Request rejected');

  response.status(status).json(
    createErrorResponse({
      message: status >= 500 ? 'An unexpected error occurred' : error.message,
      code,
      details: error.details,
      requestId: request.id,
    }),
  );
}
