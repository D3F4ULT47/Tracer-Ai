import { createSuccessResponse } from '@tracer-ai/shared/contracts';
import { roadmapService } from './roadmap.service.js';

function send(response, request, message, data) {
  response.json(createSuccessResponse({ message, data, requestId: request.id }));
}

export const roadmapController = Object.freeze({
  async list(request, response) {
    send(response, request, 'Roadmaps loaded', {
      roadmaps: await roadmapService.list(request.auth.userId),
    });
  },
  async get(request, response) {
    send(response, request, 'Roadmap loaded', {
      workspace: await roadmapService.get(request.auth.userId, request.params.roadmapId),
    });
  },
  async adoptAnonymous(request, response) {
    send(response, request, 'Anonymous roadmap adopted', {
      workspace: await roadmapService.adoptAnonymous({
        ownerId: request.auth.userId,
        roadmapId: request.params.roadmapId,
        anonymousSessionId: request.body.anonymousSessionId,
      }),
    });
  },
  async update(request, response) {
    send(response, request, 'Roadmap saved', {
      workspace: await roadmapService.update({
        ownerId: request.auth.userId,
        roadmapId: request.params.roadmapId,
        ...request.body,
      }),
    });
  },
  async createNode(request, response) {
    send(response, request, 'Roadmap section added', {
      workspace: await roadmapService.createNode({
        ownerId: request.auth.userId,
        roadmapId: request.params.roadmapId,
        ...request.body,
      }),
    });
  },
  async updateNode(request, response) {
    send(response, request, 'Roadmap section saved', {
      workspace: await roadmapService.updateNode({
        ownerId: request.auth.userId,
        ...request.params,
        ...request.body,
      }),
    });
  },
  async deleteNode(request, response) {
    send(response, request, 'Roadmap section deleted', {
      workspace: await roadmapService.deleteNode({
        ownerId: request.auth.userId,
        ...request.params,
        ...request.body,
      }),
    });
  },
  async visibility(request, response) {
    send(response, request, 'Roadmap visibility updated', {
      workspace: await roadmapService.setVisibility({
        ownerId: request.auth.userId,
        roadmapId: request.params.roadmapId,
        ...request.body,
      }),
    });
  },
  async duplicate(request, response) {
    send(response, request, 'Roadmap duplicated', {
      workspace: await roadmapService.duplicate(request.auth.userId, request.params.roadmapId),
    });
  },
  async remove(request, response) {
    send(
      response,
      request,
      'Roadmap moved to recoverable deletion',
      await roadmapService.remove(request.auth.userId, request.params.roadmapId),
    );
  },
});
