import { defineEndpoint } from './endpoint.js';

const document = { type: 'object', additionalProperties: true };
const profileData = {
  type: 'object',
  required: ['profile'],
  properties: { profile: document },
  additionalProperties: false,
};
const learningProfileData = {
  type: 'object',
  required: ['learningProfile'],
  properties: { learningProfile: document },
  additionalProperties: false,
};

export const USER_ENDPOINTS = Object.freeze({
  me: defineEndpoint({
    id: 'users.me',
    method: 'GET',
    path: '/users/me',
    auth: true,
    dataSchema: {
      type: 'object',
      required: ['user', 'profileProvisioned'],
      properties: { user: document, profileProvisioned: { type: 'boolean' } },
      additionalProperties: false,
    },
  }),
  profile: defineEndpoint({
    id: 'users.profile',
    method: 'GET',
    path: '/users/me/profile',
    auth: true,
    dataSchema: profileData,
  }),
  updateProfile: defineEndpoint({
    id: 'users.update-profile',
    method: 'PATCH',
    path: '/users/me/profile',
    auth: true,
    csrf: true,
    dataSchema: profileData,
    bodySchema: {
      type: 'object',
      minProperties: 1,
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 100 },
        education: { type: 'array', maxItems: 30, items: { type: 'string', maxLength: 300 } },
        experience: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 500 } },
        skills: {
          type: 'array',
          maxItems: 200,
          uniqueItems: true,
          items: { type: 'string', maxLength: 100 },
        },
      },
      additionalProperties: false,
    },
  }),
  learningProfile: defineEndpoint({
    id: 'users.learning-profile',
    method: 'GET',
    path: '/users/me/learning-profile',
    auth: true,
    dataSchema: learningProfileData,
  }),
  updateLearningProfile: defineEndpoint({
    id: 'users.update-learning-profile',
    method: 'PATCH',
    path: '/users/me/learning-profile',
    auth: true,
    csrf: true,
    dataSchema: learningProfileData,
    bodySchema: {
      type: 'object',
      minProperties: 1,
      properties: {
        preferredLanguage: { type: 'string', maxLength: 50 },
        learningPace: { enum: ['slow', 'balanced', 'fast'] },
        learningStyle: { type: 'string', maxLength: 100 },
        preferredRoadmapStyle: { type: 'string', maxLength: 100 },
        weeklyHours: { type: 'number', minimum: 1, maximum: 168 },
        budget: { type: 'number', minimum: 0 },
        preferredPlatforms: {
          type: 'array',
          maxItems: 30,
          items: { type: 'string', maxLength: 100 },
        },
        preferredCreators: {
          type: 'array',
          maxItems: 50,
          items: { type: 'string', maxLength: 100 },
        },
        preferredResourceTypes: {
          type: 'array',
          maxItems: 20,
          items: { type: 'string', maxLength: 50 },
        },
      },
      additionalProperties: false,
    },
  }),
  clearInferences: defineEndpoint({
    id: 'users.clear-inferences',
    method: 'DELETE',
    path: '/users/me/learning-profile/inferences',
    auth: true,
    csrf: true,
  }),
  clearInference: defineEndpoint({
    id: 'users.clear-inference',
    method: 'DELETE',
    path: '/users/me/learning-profile/inferences/:field',
    auth: true,
    csrf: true,
  }),
  scheduleDeletion: defineEndpoint({
    id: 'users.schedule-deletion',
    method: 'DELETE',
    path: '/users/me',
    auth: true,
    csrf: true,
    dataSchema: {
      type: 'object',
      required: ['deletionScheduledAt'],
      properties: { deletionScheduledAt: { type: 'string' } },
      additionalProperties: false,
    },
  }),
  cancelDeletion: defineEndpoint({
    id: 'users.cancel-deletion',
    method: 'POST',
    path: '/users/me/deletion/cancel',
    auth: true,
    csrf: true,
  }),
  resumes: defineEndpoint({
    id: 'users.resumes',
    method: 'GET',
    path: '/users/me/resumes',
    auth: true,
    dataSchema: {
      type: 'object',
      required: ['resumes'],
      properties: { resumes: { type: 'array', items: document } },
      additionalProperties: false,
    },
  }),
});
