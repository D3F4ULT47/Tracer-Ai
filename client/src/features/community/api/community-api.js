import { COMMUNITY_ENDPOINTS } from '@tracer-ai/shared/contracts';
import { contractRequest } from '../../../api/contract-client.js';

export const communityApi = Object.freeze({
  feed: () => contractRequest(COMMUNITY_ENDPOINTS.feed),
});
