import { ROADMAP_PLANNING_ENDPOINTS } from '@tracer-ai/shared/contracts';
import { Router } from 'express';
import { asyncHandler } from '../../../shared/async-handler.js';
import { registerContractRoute } from '../../../shared/contract-route.js';
import { authenticate, optionalAuthenticate, requireCsrf } from '../../auth/index.js';
import { aiGenerationRateLimit } from '../ai-rate-limit.js';
import { idempotent } from '../reuse/idempotency.js';
import { preparationController } from '../preparation/preparation.controller.js';
import { roadmapPlanningController } from './roadmap-planning.controller.js';

export const roadmapPlanningRouter = Router();

registerContractRoute(
  roadmapPlanningRouter,
  ROADMAP_PLANNING_ENDPOINTS.prepare,
  optionalAuthenticate,
  idempotent(ROADMAP_PLANNING_ENDPOINTS.prepare.id),
  aiGenerationRateLimit,
  asyncHandler(preparationController.prepare),
);

registerContractRoute(
  roadmapPlanningRouter,
  ROADMAP_PLANNING_ENDPOINTS.progress,
  asyncHandler(roadmapPlanningController.progress),
);

registerContractRoute(
  roadmapPlanningRouter,
  ROADMAP_PLANNING_ENDPOINTS.preview,
  optionalAuthenticate,
  idempotent(ROADMAP_PLANNING_ENDPOINTS.preview.id),
  aiGenerationRateLimit,
  asyncHandler(roadmapPlanningController.preview),
);

registerContractRoute(
  roadmapPlanningRouter,
  ROADMAP_PLANNING_ENDPOINTS.generate,
  authenticate,
  requireCsrf,
  idempotent(ROADMAP_PLANNING_ENDPOINTS.generate.id),
  aiGenerationRateLimit,
  asyncHandler(roadmapPlanningController.generate),
);
