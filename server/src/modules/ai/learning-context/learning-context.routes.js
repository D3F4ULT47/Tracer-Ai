import { LEARNING_CONTEXT_ENDPOINTS } from '@tracer-ai/shared/contracts';
import { Router } from 'express';
import { asyncHandler } from '../../../shared/async-handler.js';
import { registerContractRoute } from '../../../shared/contract-route.js';
import { optionalAuthenticate } from '../../auth/index.js';
import { learningContextController } from './learning-context.controller.js';

export const learningContextRouter = Router();

registerContractRoute(
  learningContextRouter,
  LEARNING_CONTEXT_ENDPOINTS.create,
  optionalAuthenticate,
  asyncHandler(learningContextController.create),
);
