import { defineEndpoint } from './endpoint.js';

export const ACTIVITY_TYPES = Object.freeze([
  'ROADMAP_CREATED',
  'ROADMAP_UPDATED',
  'ROADMAP_DELETED',
  'ROADMAP_FORKED',
  'ROADMAP_PUBLISHED',
  'ROADMAP_UNPUBLISHED',
  'PHASE_COMPLETED',
  'TASK_COMPLETED',
  'TASK_ADDED',
  'TASK_REMOVED',
  'TASK_RENAMED',
  'RESOURCE_ATTACHED',
  'RESOURCE_REPLACED',
  'RESOURCE_REMOVED',
  'NOTE_ADDED',
  'NOTE_UPDATED',
  'NOTE_DELETED',
]);

const activity = {
  type: 'object',
  required: [
    'activityId',
    'userId',
    'roadmapId',
    'roadmapTitle',
    'activityType',
    'entityType',
    'entityId',
    'shortDescription',
    'timestamp',
    'metadata',
  ],
  properties: {
    activityId: { type: 'string', format: 'uuid' },
    userId: { type: 'string', pattern: '^[a-f0-9]{24}$' },
    roadmapId: { type: 'string', format: 'uuid' },
    roadmapTitle: { type: 'string', minLength: 1, maxLength: 300 },
    activityType: { enum: ACTIVITY_TYPES },
    entityType: { type: ['string', 'null'], enum: ['roadmap', 'phase', 'week', 'task', null] },
    entityId: { type: ['string', 'null'], maxLength: 500 },
    shortDescription: { type: 'string', minLength: 1, maxLength: 500 },
    timestamp: { type: 'string', format: 'date-time' },
    metadata: { type: 'object' },
  },
  additionalProperties: false,
};

export const ACTIVITY_ENDPOINTS = Object.freeze({
  list: defineEndpoint({
    id: 'activity.list',
    method: 'GET',
    path: '/activity',
    auth: true,
    dataSchema: {
      type: 'object',
      required: ['activities', 'nextCursor'],
      properties: {
        activities: { type: 'array', maxItems: 50, items: activity },
        nextCursor: { type: ['string', 'null'], maxLength: 1000 },
      },
      additionalProperties: false,
    },
  }),
});
