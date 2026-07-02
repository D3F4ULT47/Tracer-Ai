import { ROADMAP_WORKSPACE_ENDPOINTS } from '@tracer-ai/shared/contracts';
import { contractRequest } from '../../../api/contract-client.js';

export const roadmapApi = Object.freeze({
  list: () => contractRequest(ROADMAP_WORKSPACE_ENDPOINTS.list),
  get: (roadmapId) => contractRequest(ROADMAP_WORKSPACE_ENDPOINTS.get, { params: { roadmapId } }),
  update: ({ roadmapId, ...body }) =>
    contractRequest(ROADMAP_WORKSPACE_ENDPOINTS.update, { params: { roadmapId }, body }),
  createNode: ({ roadmapId, ...body }) =>
    contractRequest(ROADMAP_WORKSPACE_ENDPOINTS.createNode, { params: { roadmapId }, body }),
  updateNode: ({ roadmapId, nodeType, nodeKey, ...body }) =>
    contractRequest(ROADMAP_WORKSPACE_ENDPOINTS.updateNode, {
      params: { roadmapId, nodeType, nodeKey },
      body,
    }),
  deleteNode: ({ roadmapId, nodeType, nodeKey, ...body }) =>
    contractRequest(ROADMAP_WORKSPACE_ENDPOINTS.deleteNode, {
      params: { roadmapId, nodeType, nodeKey },
      body,
    }),
  setVisibility: ({ roadmapId, ...body }) =>
    contractRequest(ROADMAP_WORKSPACE_ENDPOINTS.visibility, {
      params: { roadmapId },
      body,
    }),
  duplicate: (roadmapId) =>
    contractRequest(ROADMAP_WORKSPACE_ENDPOINTS.duplicate, {
      params: { roadmapId },
      body: {},
    }),
  remove: (roadmapId) =>
    contractRequest(ROADMAP_WORKSPACE_ENDPOINTS.remove, {
      params: { roadmapId },
      body: {},
    }),
});
