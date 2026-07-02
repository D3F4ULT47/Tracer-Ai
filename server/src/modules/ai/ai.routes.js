import { Router } from 'express';
import { assessmentRouter } from './assessment/assessment.routes.js';
import { clarificationRouter } from './clarification/clarification.routes.js';
import { inputRouter } from './input/input.routes.js';
import { learningContextRouter } from './learning-context/learning-context.routes.js';
import { roadmapPlanningRouter } from './roadmap-planning/roadmap-planning.routes.js';
import { sourceUnderstandingRouter } from './source-understanding/source-understanding.routes.js';

export const aiRouter = Router();

aiRouter.use(inputRouter);
aiRouter.use(sourceUnderstandingRouter);
aiRouter.use(assessmentRouter);
aiRouter.use(learningContextRouter);
aiRouter.use(clarificationRouter);
aiRouter.use(roadmapPlanningRouter);
