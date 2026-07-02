import { ASSESSMENT_ENDPOINTS } from '@tracer-ai/shared/contracts';
import { Router } from 'express';
import { asyncHandler } from '../../../shared/async-handler.js';
import { registerContractRoute } from '../../../shared/contract-route.js';
import { optionalAuthenticate } from '../../auth/index.js';
import { aiGenerationRateLimit } from '../ai-rate-limit.js';
import { assessmentController } from './assessment.controller.js';

export const assessmentRouter = Router();

registerContractRoute(
  assessmentRouter,
  ASSESSMENT_ENDPOINTS.create,
  optionalAuthenticate,
  aiGenerationRateLimit,
  asyncHandler(assessmentController.create),
);
