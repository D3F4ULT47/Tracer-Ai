export { activityRepository } from './activity.repository.js';
export { createActivityEvent } from './activity-event.js';
export { RoadmapActivity } from './models/roadmap-activity.model.js';
export { activityRouter } from './activity.routes.js';
export { activityService, createActivityService } from './activity.service.js';

export const activityModule = Object.freeze({ name: 'activity', routePrefix: '/activity' });
