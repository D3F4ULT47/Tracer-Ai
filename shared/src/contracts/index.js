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
export * from './activity.contracts.js';
export * from './assessment.contracts.js';
export * from './clarification.contracts.js';
export * from './community.contracts.js';
export * from './endpoint.js';
export * from './input.contracts.js';
export * from './learning-context.contracts.js';
export * from './roadmap-planning.contracts.js';
export * from './roadmap-workspace.contracts.js';
export * from './source-understanding.contracts.js';
export * from './user.contracts.js';
