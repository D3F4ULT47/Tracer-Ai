import { ROADMAP_WORKSPACE_ENDPOINTS } from '@tracer-ai/shared/contracts';
import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { registerContractRoute } from '../../shared/contract-route.js';
import { authenticate, requireCsrf } from '../auth/index.js';
import { roadmapController } from './roadmap.controller.js';

export const roadmapRouter = Router();

registerContractRoute(
  roadmapRouter,
  ROADMAP_WORKSPACE_ENDPOINTS.list,
  authenticate,
  asyncHandler(roadmapController.list),
);
registerContractRoute(
  roadmapRouter,
  ROADMAP_WORKSPACE_ENDPOINTS.get,
  authenticate,
  asyncHandler(roadmapController.get),
);
registerContractRoute(
  roadmapRouter,
  ROADMAP_WORKSPACE_ENDPOINTS.adoptAnonymous,
  authenticate,
  requireCsrf,
  asyncHandler(roadmapController.adoptAnonymous),
);
registerContractRoute(
  roadmapRouter,
  ROADMAP_WORKSPACE_ENDPOINTS.update,
  authenticate,
  requireCsrf,
  asyncHandler(roadmapController.update),
);
registerContractRoute(
  roadmapRouter,
  ROADMAP_WORKSPACE_ENDPOINTS.createNode,
  authenticate,
  requireCsrf,
  asyncHandler(roadmapController.createNode),
);
registerContractRoute(
  roadmapRouter,
  ROADMAP_WORKSPACE_ENDPOINTS.updateNode,
  authenticate,
  requireCsrf,
  asyncHandler(roadmapController.updateNode),
);
registerContractRoute(
  roadmapRouter,
  ROADMAP_WORKSPACE_ENDPOINTS.deleteNode,
  authenticate,
  requireCsrf,
  asyncHandler(roadmapController.deleteNode),
);
registerContractRoute(
  roadmapRouter,
  ROADMAP_WORKSPACE_ENDPOINTS.visibility,
  authenticate,
  requireCsrf,
  asyncHandler(roadmapController.visibility),
);
registerContractRoute(
  roadmapRouter,
  ROADMAP_WORKSPACE_ENDPOINTS.duplicate,
  authenticate,
  requireCsrf,
  asyncHandler(roadmapController.duplicate),
);
registerContractRoute(
  roadmapRouter,
  ROADMAP_WORKSPACE_ENDPOINTS.remove,
  authenticate,
  requireCsrf,
  asyncHandler(roadmapController.remove),
);
