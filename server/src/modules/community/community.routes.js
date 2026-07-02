import { COMMUNITY_ENDPOINTS } from '@tracer-ai/shared/contracts';
import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { registerContractRoute } from '../../shared/contract-route.js';
import { communityController } from './community.controller.js';

export const communityRouter = Router();

registerContractRoute(
  communityRouter,
  COMMUNITY_ENDPOINTS.feed,
  asyncHandler(communityController.feed),
);
