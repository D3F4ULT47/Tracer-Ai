import { createHash } from 'node:crypto';
import {
  PREPARATION_OPERATIONS,
  PREPARATION_ROUTER_VERSION,
  PREPARATION_STATES,
} from '@tracer-ai/shared/constants';

const { REQUIRED, NOT_REQUIRED, ALREADY_AVAILABLE, INSUFFICIENT_EVIDENCE } = PREPARATION_STATES;

const contentSourceTypes = new Set([
  'ai_report',
  'github_repository',
  'youtube_video',
  'google_document',
  'pdf',
  'project_description',
]);

const selfDescriptionPattern =
  /\b(?:i(?:\s+have|['’]ve)\s+(?:worked|been|built|used|done|completed|learned|learnt|studied|shipped|led)|i(?:\s+am|['’]m)\s+(?:an?\s+|currently\s+)|i\s+(?:already\s+)?know\b|i\s+(?:currently\s+)?work(?:ed)?\s+(?:as|at|on|with)|my\s+(?:experience|background|skills)\b|\d{1,2}\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|working))/i;

export function isPlanningSource(source) {
  return source.type !== 'resume';
}

/**
 * Stable key for the planning inputs as submitted, so a prior understanding can be reused only
 * when the same sources are planned again.
 */
export function planningInputKey(sources) {
  const planning = sources
    .filter(isPlanningSource)
    .map(({ type, url = null, content = null }) => ({ type, url, content }));
  return createHash('sha256').update(JSON.stringify(planning)).digest('hex');
}

export function hasSelfDescription(text) {
  return typeof text === 'string' && selfDescriptionPattern.test(text);
}

function selectedLevel(explicitInput = {}, questionnaire = {}) {
  const level = explicitInput.experienceLevel ?? questionnaire.experienceLevel ?? null;
  return level && level !== 'not_sure' ? level : null;
}

export function sourceUnderstandingState(sources, prior) {
  const planning = sources.filter(isPlanningSource);
  const contentTypes = [...new Set(planning.map((source) => source.type))].filter(
    (type) => type !== 'natural_prompt',
  );

  if (contentTypes.length === 0) {
    return { state: NOT_REQUIRED, reason: 'only natural-language goal text' };
  }
  if (prior?.understanding && prior.inputKey === planningInputKey(sources)) {
    return { state: ALREADY_AVAILABLE, reason: 'validated understanding for the same sources' };
  }
  const unknown = contentTypes.filter((type) => !contentSourceTypes.has(type));
  return {
    state: REQUIRED,
    reason: unknown.length
      ? `unrecognised source type treated as content: ${unknown.join(', ')}`
      : `${contentTypes.join(', ')} source present`,
  };
}

export function learnerAssessmentState({ assessmentInputs = {}, explicitInput, questionnaire }) {
  if (assessmentInputs.resumeText) return { state: REQUIRED, reason: 'resume text present' };
  const goalText = assessmentInputs.naturalLanguage ?? assessmentInputs.projectDescription;
  if (hasSelfDescription(goalText)) {
    return { state: REQUIRED, reason: 'goal text describes the learner' };
  }
  if (selectedLevel(explicitInput, questionnaire)) {
    return { state: NOT_REQUIRED, reason: 'level selected by the user, no unstructured evidence' };
  }
  return {
    state: INSUFFICIENT_EVIDENCE,
    reason: 'no learner evidence and no selected level',
  };
}

/**
 * Deterministic preparation routing (RFC 0001 section 4). No model call is made here.
 */
export function decidePreparation({
  sources,
  assessmentInputs,
  explicitInput = {},
  questionnaire = {},
  prior = null,
  assessmentEnabled = true,
}) {
  const sourceUnderstanding = sourceUnderstandingState(sources, prior);
  const assessed = learnerAssessmentState({ assessmentInputs, explicitInput, questionnaire });
  const learnerAssessment =
    assessed.state === REQUIRED && !assessmentEnabled
      ? learnerAssessmentState({ assessmentInputs: {}, explicitInput, questionnaire })
      : assessed;
  if (learnerAssessment !== assessed) {
    learnerAssessment.reason = `learner assessment is disabled; ${learnerAssessment.reason}`;
  }
  const runSource = sourceUnderstanding.state === REQUIRED;
  const runLearner = learnerAssessment.state === REQUIRED;
  const preparationCase = runSource && runLearner ? 3 : runSource ? 2 : runLearner ? 4 : 1;
  const operations =
    preparationCase === 3
      ? [PREPARATION_OPERATIONS.COMBINED_PREPARATION]
      : preparationCase === 2
        ? [PREPARATION_OPERATIONS.SOURCE_UNDERSTANDING]
        : preparationCase === 4
          ? [PREPARATION_OPERATIONS.LEARNER_ASSESSMENT]
          : [];

  return Object.freeze({
    routerVersion: PREPARATION_ROUTER_VERSION,
    case: preparationCase,
    sourceUnderstanding: Object.freeze(sourceUnderstanding),
    learnerAssessment: Object.freeze(learnerAssessment),
    operations: Object.freeze(operations),
    profiles: Object.freeze({ preparation: 'fast', generation: 'core' }),
    expectedCalls: operations.length + 1,
    inputKey: planningInputKey(sources),
  });
}
