import { ACTIVITY_ENDPOINTS } from '@tracer-ai/shared/contracts';
import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { registerContractRoute } from '../../shared/contract-route.js';
import { authenticate } from '../auth/index.js';
import { activityController } from './activity.controller.js';

export const activityRouter = Router();

registerContractRoute(
  activityRouter,
  ACTIVITY_ENDPOINTS.list,
  authenticate,
  asyncHandler(activityController.list),
);
