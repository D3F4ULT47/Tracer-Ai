import { SOURCE_UNDERSTANDING_ENDPOINTS } from '@tracer-ai/shared/contracts';
import { Router } from 'express';
import { asyncHandler } from '../../../shared/async-handler.js';
import { registerContractRoute } from '../../../shared/contract-route.js';
import { optionalAuthenticate } from '../../auth/index.js';
import { aiGenerationRateLimit } from '../ai-rate-limit.js';
import { idempotent } from '../reuse/idempotency.js';
import { sourceUnderstandingController } from './source-understanding.controller.js';

export const sourceUnderstandingRouter = Router();

registerContractRoute(
  sourceUnderstandingRouter,
  SOURCE_UNDERSTANDING_ENDPOINTS.create,
  optionalAuthenticate,
  idempotent(SOURCE_UNDERSTANDING_ENDPOINTS.create.id),
  aiGenerationRateLimit,
  asyncHandler(sourceUnderstandingController.create),
);
