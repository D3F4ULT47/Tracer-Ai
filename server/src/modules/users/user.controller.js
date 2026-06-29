import { createSuccessResponse } from '@tracer-ai/shared/contracts';
import { userService } from './user.service.js';

function send(response, request, message, data = {}) {
  response.json(createSuccessResponse({ message, data, requestId: request.id }));
}

export const userController = Object.freeze({
  async me(request, response) {
    send(response, request, 'User retrieved', await userService.getMe(request.auth.userId));
  },
  async profile(request, response) {
    send(response, request, 'Profile retrieved', {
      profile: await userService.getProfile(request.auth.userId),
    });
  },
  async updateProfile(request, response) {
    send(response, request, 'Profile updated', {
      profile: await userService.updateProfile(request.auth.userId, request.body),
    });
  },
  async learningProfile(request, response) {
    send(response, request, 'Learning profile retrieved', {
      learningProfile: await userService.getLearningProfile(request.auth.userId),
    });
  },
  async updateLearningProfile(request, response) {
    send(response, request, 'Learning profile updated', {
      learningProfile: await userService.updateLearningProfile(request.auth.userId, request.body),
    });
  },
  async clearInferences(request, response) {
    await userService.clearInferences(request.auth.userId, request.params.field);
    send(response, request, 'AI inferences cleared');
  },
  async resumes(request, response) {
    send(response, request, 'Resumes retrieved', {
      resumes: await userService.listResumes(request.auth.userId),
    });
  },
  async scheduleDeletion(request, response) {
    const deletionScheduledAt = await userService.scheduleDeletion(request.auth.userId);
    send(response, request, 'Account deletion scheduled', {
      deletionScheduledAt: deletionScheduledAt.toISOString(),
    });
  },
  async cancelDeletion(request, response) {
    await userService.cancelDeletion(request.auth.userId);
    send(response, request, 'Account deletion cancelled');
  },
});
