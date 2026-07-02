import { ACTIVITY_ENDPOINTS } from '@tracer-ai/shared/contracts';
import { contractRequest } from '../../../api/contract-client.js';

export const activityApi = Object.freeze({
  list: ({ cursor, limit = 10, activityType } = {}) =>
    contractRequest(ACTIVITY_ENDPOINTS.list, {
      query: { cursor, limit, activityType },
    }),
});
