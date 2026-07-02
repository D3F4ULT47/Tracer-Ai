import { userService } from '../../users/index.js';

export const learningContextRepository = Object.freeze({
  async getProfiles(ownerId) {
    return userService.getLearningContextSources(ownerId);
  },
});
