import { USER_ENDPOINTS } from '@tracer-ai/shared/contracts';
import { Router } from 'express';
import { asyncHandler } from '../../shared/async-handler.js';
import { registerContractRoute } from '../../shared/contract-route.js';
import { authenticate, requireCsrf } from '../auth/index.js';
import { userController } from './user.controller.js';

export const userRouter = Router();
const handlers = {
  me: userController.me,
  profile: userController.profile,
  updateProfile: userController.updateProfile,
  learningProfile: userController.learningProfile,
  updateLearningProfile: userController.updateLearningProfile,
  clearInferences: userController.clearInferences,
  clearInference: userController.clearInferences,
  scheduleDeletion: userController.scheduleDeletion,
  cancelDeletion: userController.cancelDeletion,
  resumes: userController.resumes,
};

for (const [key, contract] of Object.entries(USER_ENDPOINTS)) {
  registerContractRoute(
    userRouter,
    contract,
    authenticate,
    ...(contract.csrf ? [requireCsrf] : []),
    asyncHandler(handlers[key]),
  );
}
