import { env } from '../../config/env.js';
import { AppError } from '../../shared/app-error.js';

const modelProfiles = Object.freeze({
  fast: env.AI_MODEL_FAST,
  core: env.AI_MODEL_CORE,
  escalation: env.AI_MODEL_ESCALATION,
});

export const aiConfig = Object.freeze({
  provider: env.AI_PROVIDER,
  apiKey: env.OPENAI_API_KEY,
  requestTimeoutMs: env.AI_REQUEST_TIMEOUT_MS,
  assessmentConfidenceThreshold: env.AI_ASSESSMENT_CONFIDENCE_THRESHOLD,
  assessmentMaxOutputTokens: env.AI_ASSESSMENT_MAX_OUTPUT_TOKENS,
  sourceUnderstandingMaxOutputTokens: env.AI_SOURCE_UNDERSTANDING_MAX_OUTPUT_TOKENS,
  roadmapMaxOutputTokens: env.AI_ROADMAP_MAX_OUTPUT_TOKENS,
  modelProfiles,
});

export function requireAiConfiguration(profile = 'core') {
  const model = aiConfig.modelProfiles[profile];

  if (!aiConfig.apiKey || !model) {
    throw new AppError('AI generation is not configured', {
      status: 503,
      code: 'AI_NOT_CONFIGURED',
    });
  }

  return Object.freeze({
    provider: aiConfig.provider,
    apiKey: aiConfig.apiKey,
    model,
    profile,
    requestTimeoutMs: aiConfig.requestTimeoutMs,
  });
}
