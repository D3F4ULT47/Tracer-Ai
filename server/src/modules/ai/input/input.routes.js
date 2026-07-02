import { INPUT_ENDPOINTS } from '@tracer-ai/shared/contracts';
import { Router } from 'express';
import { asyncHandler } from '../../../shared/async-handler.js';
import { registerContractRoute } from '../../../shared/contract-route.js';
import { optionalAuthenticate } from '../../auth/index.js';
import { receiveDocumentUpload, receiveResumeUpload } from '../../uploads/index.js';
import { inputController } from './input.controller.js';

export const inputRouter = Router();

registerContractRoute(
  inputRouter,
  INPUT_ENDPOINTS.ingestText,
  optionalAuthenticate,
  asyncHandler(inputController.ingestText),
);

registerContractRoute(
  inputRouter,
  INPUT_ENDPOINTS.ingestDocument,
  optionalAuthenticate,
  receiveDocumentUpload,
  asyncHandler(inputController.ingestDocument),
);

registerContractRoute(
  inputRouter,
  INPUT_ENDPOINTS.ingestResume,
  optionalAuthenticate,
  receiveResumeUpload,
  asyncHandler(inputController.ingestResume),
);
