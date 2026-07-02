import { ROADMAP_PLANNING_ENDPOINTS } from '@tracer-ai/shared/contracts';
import { Router } from 'express';
import { asyncHandler } from '../../../shared/async-handler.js';
import { registerContractRoute } from '../../../shared/contract-route.js';
import { authenticate, optionalAuthenticate, requireCsrf } from '../../auth/index.js';
import { aiGenerationRateLimit } from '../ai-rate-limit.js';
import { roadmapPlanningController } from './roadmap-planning.controller.js';

export const roadmapPlanningRouter = Router();

registerContractRoute(
  roadmapPlanningRouter,
  ROADMAP_PLANNING_ENDPOINTS.preview,
  optionalAuthenticate,
  aiGenerationRateLimit,
  asyncHandler(roadmapPlanningController.preview),
);

registerContractRoute(
  roadmapPlanningRouter,
  ROADMAP_PLANNING_ENDPOINTS.generate,
  authenticate,
  requireCsrf,
  aiGenerationRateLimit,
  asyncHandler(roadmapPlanningController.generate),
);
