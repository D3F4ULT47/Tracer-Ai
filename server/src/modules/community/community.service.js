import { communityRepository } from './community.repository.js';

export function createCommunityService({ repository = communityRepository } = {}) {
  return Object.freeze({
    async feed() {
      return { roadmaps: await repository.listNewestPublic(20) };
    },
  });
}

export const communityService = createCommunityService();
