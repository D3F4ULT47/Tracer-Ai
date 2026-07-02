export { aiConfig, requireAiConfiguration } from './ai.config.js';
export { validateAiOutput } from './json.validator.js';
export { loadPrompt } from './prompt.repository.js';
export { assessmentService, createAssessmentService } from './assessment/assessment.service.js';
export {
  clarificationQuestionRegistry,
  clarificationService,
  createClarificationService,
} from './clarification/index.js';
export {
  buildLearningContext,
  createLearningContextService,
  learningContextService,
} from './learning-context/index.js';
export { AiPrompt } from './models/ai-prompt.model.js';
export { AiRun } from './models/ai-run.model.js';
export { AiUsageRecord } from './models/ai-usage-record.model.js';
export { aiRouter } from './ai.routes.js';
export * from './roadmap-planning/index.js';
export * from './source-understanding/index.js';
export { AiProviderRegistry, aiProviderRegistry } from './providers/ai-provider.registry.js';
export { getConfiguredAiProvider } from './providers/provider.factory.js';

export const aiModule = Object.freeze({ name: 'ai', routePrefix: '/ai' });
