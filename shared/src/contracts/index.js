export const API_ERROR_CODES = Object.freeze({
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  NOT_READY: 'NOT_READY',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
});

export function createSuccessResponse({ message = '', data = {}, requestId } = {}) {
  return {
    success: true,
    message,
    data,
    ...(requestId ? { requestId } : {}),
  };
}

export function createErrorResponse({
  message,
  code = API_ERROR_CODES.INTERNAL_ERROR,
  details,
  requestId,
}) {
  return {
    success: false,
    message,
    error: {
      code,
      ...(details ? { details } : {}),
    },
    ...(requestId ? { requestId } : {}),
  };
}

export * from './auth.contracts.js';
export * from './endpoint.js';
export * from './user.contracts.js';
