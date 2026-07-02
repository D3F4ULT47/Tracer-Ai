export { communityRouter } from './community.routes.js';
export { communityService, createCommunityService } from './community.service.js';

export const communityModule = Object.freeze({ name: 'community', routePrefix: '/community' });
