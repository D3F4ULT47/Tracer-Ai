import { USER_ENDPOINTS } from '@tracer-ai/shared/contracts';
import { contractRequest } from '../../../api/contract-client.js';

export const userApi = Object.freeze({
  me: (options) => contractRequest(USER_ENDPOINTS.me, options),
  profile: () => contractRequest(USER_ENDPOINTS.profile),
  updateProfile: (body) => contractRequest(USER_ENDPOINTS.updateProfile, { body }),
  learningProfile: () => contractRequest(USER_ENDPOINTS.learningProfile),
  updateLearningProfile: (body) => contractRequest(USER_ENDPOINTS.updateLearningProfile, { body }),
  clearInferences: () => contractRequest(USER_ENDPOINTS.clearInferences),
  resumes: () => contractRequest(USER_ENDPOINTS.resumes),
  scheduleDeletion: () => contractRequest(USER_ENDPOINTS.scheduleDeletion),
  cancelDeletion: () => contractRequest(USER_ENDPOINTS.cancelDeletion),
});
