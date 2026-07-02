import { CLARIFICATION_ENDPOINTS } from '@tracer-ai/shared/contracts';
import { Router } from 'express';
import { asyncHandler } from '../../../shared/async-handler.js';
import { registerContractRoute } from '../../../shared/contract-route.js';
import { optionalAuthenticate } from '../../auth/index.js';
import { clarificationController } from './clarification.controller.js';

export const clarificationRouter = Router();
const handlers = {
  decide: clarificationController.decide,
  respond: clarificationController.respond,
};

for (const [key, contract] of Object.entries(CLARIFICATION_ENDPOINTS)) {
  registerContractRoute(
    clarificationRouter,
    contract,
    optionalAuthenticate,
    asyncHandler(handlers[key]),
  );
}
