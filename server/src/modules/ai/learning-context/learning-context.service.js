import { AppError } from '../../../shared/app-error.js';
import { validateAiOutput } from '../json.validator.js';
import { buildLearningContext } from './learning-context.builder.js';
import { learningContextRepository } from './learning-context.repository.js';

export function createLearningContextService({ repository = learningContextRepository } = {}) {
  return Object.freeze({
    async create({
      ownerId,
      assessment,
      mode,
      explicitInput,
      questionnaire,
      resumeAnalysis,
      sourceVersions,
    }) {
      validateAiOutput('learnerAssessment', assessment);
      if (resumeAnalysis) validateAiOutput('resume', resumeAnalysis);

      const sources = ownerId
        ? await repository.getProfiles(ownerId)
        : {
            profile: { skills: [], education: [], experience: [], __v: 0 },
            learningProfile: { inferences: [], __v: 0 },
          };
      const { profile, learningProfile } = sources;
      if (ownerId && (!profile || !learningProfile)) {
        throw new AppError('Learning profiles are still being provisioned', {
          status: 503,
          code: 'PROFILE_PROVISIONING',
        });
      }

      const context = buildLearningContext({
        assessment,
        mode,
        explicitInput,
        questionnaire,
        profile,
        learningProfile,
        resumeAnalysis,
        sourceVersions,
      });
      validateAiOutput('learningContext', context);
      return context;
    },
  });
}

export const learningContextService = createLearningContextService();
