import { defineEndpoint } from './endpoint.js';

const communityRoadmap = {
  type: 'object',
  required: [
    'roadmapId',
    'title',
    'summary',
    'type',
    'difficulty',
    'estimatedWeeks',
    'creatorName',
    'publishedAt',
  ],
  properties: {
    roadmapId: { type: 'string', format: 'uuid' },
    title: { type: 'string', minLength: 1, maxLength: 300 },
    summary: { type: 'string', minLength: 1, maxLength: 5000 },
    type: { enum: ['career', 'skill', 'project', 'resume'] },
    difficulty: { enum: ['beginner', 'intermediate', 'advanced', 'expert'] },
    estimatedWeeks: { type: 'integer', minimum: 1, maximum: 520 },
    creatorName: { type: ['string', 'null'], maxLength: 100 },
    publishedAt: { type: 'string', format: 'date-time' },
  },
  additionalProperties: false,
};

export const COMMUNITY_ENDPOINTS = Object.freeze({
  feed: defineEndpoint({
    id: 'community.feed',
    method: 'GET',
    path: '/community/feed',
    auth: false,
    dataSchema: {
      type: 'object',
      required: ['roadmaps'],
      properties: {
        roadmaps: { type: 'array', maxItems: 50, items: communityRoadmap },
      },
      additionalProperties: false,
    },
  }),
});
