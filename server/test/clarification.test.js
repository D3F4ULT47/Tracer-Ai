import assert from 'node:assert/strict';
import test from 'node:test';
import { clarificationQuestionRegistry } from '../src/modules/ai/clarification/question-registry.js';
import { createClarificationService } from '../src/modules/ai/clarification/clarification.service.js';
import { validateAiOutput } from '../src/modules/ai/json.validator.js';
import { buildLearningContext } from '../src/modules/ai/learning-context/learning-context.builder.js';

function evidence(excerpt) {
  return { source: 'naturalLanguage', excerpt };
}

function optionalInference(value = null) {
  return value == null
    ? {
        inferred: false,
        value: null,
        confidence: 0,
        reasoning: 'No evidence was supplied.',
        evidence: [],
      }
    : {
        inferred: true,
        value,
        confidence: 0.8,
        reasoning: 'The learner input supports this inference.',
        evidence: [evidence('Learn React')],
      };
}

function assessment({ level = 'beginner', confidence = 0.9, clarificationRequired = false } = {}) {
  return {
    schemaVersion: '1.0.0',
    currentLevel: level,
    confidence,
    reasoning: 'The learner supplied enough evidence for this proficiency estimate.',
    proficiencyEvidence: [evidence('Learn React')],
    knownSkills: [],
    missingSkills: [],
    suggestedSkills: [],
    experienceSignals: [],
    educationSignals: [],
    technologyStack: [],
    careerDirection: optionalInference(),
    projectComplexity: optionalInference(),
    experienceSummary: optionalInference(),
    educationSummary: optionalInference(),
    technologySummary: optionalInference(),
    clarificationRequired,
  };
}

function context({
  mode = 'quick',
  explicitInput = {},
  questionnaire = {},
  assessmentOptions,
  learningProfile = {},
} = {}) {
  return buildLearningContext({
    assessment: assessment(assessmentOptions),
    mode,
    explicitInput,
    questionnaire,
    profile: { skills: [], education: [], experience: [], __v: 0 },
    learningProfile: { inferences: [], __v: 0, ...learningProfile },
  });
}

const service = createClarificationService();

test('Quick Mode proceeds without unnecessary preference questions', () => {
  const learningContext = context({
    explicitInput: {
      primaryGoal: 'Learn React',
      goalType: 'learning_goal',
      experienceLevel: 'beginner',
    },
  });
  const decision = service.decide(learningContext);

  assert.equal(decision.status, 'READY');
  assert.equal(decision.clarificationRequired, false);
  assert.equal(decision.selectedQuestion, null);
  assert.equal(validateAiOutput('clarification', decision), decision);
});

test('Personalized Mode avoids questions already answered in the questionnaire', () => {
  const learningContext = context({
    mode: 'personalized',
    explicitInput: {
      primaryGoal: 'Learn React',
      goalType: 'learning_goal',
      experienceLevel: 'beginner',
    },
    questionnaire: {
      weeklyHours: 10,
      preferredResourceLanguage: 'English',
      learningStyle: 'project-based',
    },
  });

  assert.equal(service.decide(learningContext).status, 'READY');
});

test('missing critical goal selects exactly one high-value free-text question', () => {
  const decision = service.decide(context());

  assert.equal(decision.status, 'CLARIFICATION_REQUIRED');
  assert.equal(decision.selectedQuestion.id, 'primary-goal');
  assert.equal(decision.selectedQuestion.type, 'free_text');
  assert.equal(decision.affectedFields.includes('primaryGoal'), true);
});

test('conflicting proficiency selects the experience question', () => {
  const learningContext = context({
    explicitInput: {
      primaryGoal: 'Learn React',
      goalType: 'learning_goal',
      experienceLevel: 'beginner',
    },
    assessmentOptions: { level: 'advanced' },
  });
  const decision = service.decide(learningContext);

  assert.equal(decision.selectedQuestion.id, 'current-proficiency');
  assert.equal(decision.selectedQuestion.options.length, 4);
});

test('question ranking chooses weekly hours before lower-ranked goal ambiguity', () => {
  const learningContext = context({
    mode: 'personalized',
    explicitInput: { primaryGoal: 'Move into technology', experienceLevel: 'beginner' },
  });
  const decision = service.decide(learningContext);

  assert.equal(decision.selectedQuestion.id, 'weekly-hours');
  assert.equal(decision.selectedQuestion.type, 'number');
});

test('all approved clarification question types are supported', () => {
  assert.deepEqual([...new Set(clarificationQuestionRegistry.map(({ type }) => type))].sort(), [
    'boolean',
    'date',
    'dropdown',
    'free_text',
    'multiple_choice',
    'number',
  ]);
});

test('a response updates and versions Learning Context, then forces READY', () => {
  const learningContext = context({
    mode: 'personalized',
    explicitInput: {
      primaryGoal: 'Learn React',
      goalType: 'learning_goal',
      experienceLevel: 'beginner',
    },
  });
  const decision = service.decide(learningContext);
  assert.equal(decision.selectedQuestion.id, 'weekly-hours');

  const updated = service.respond({ context: learningContext, decision, answer: 8 });

  assert.equal(updated.context.weeklyHours.value, 8);
  assert.equal(updated.context.weeklyHours.provenance[0].source, 'explicit_user');
  assert.equal(updated.context.contextVersion, 2);
  assert.equal(updated.context.generatedFrom.clarificationVersion, 1);
  assert.equal(updated.context.clarificationState.questionAsked, true);
  assert.equal(updated.decision.status, 'READY');
  assert.equal(validateAiOutput('learningContext', updated.context), updated.context);
  assert.throws(
    () => service.respond({ context: updated.context, decision, answer: 10 }),
    (error) => error.code === 'CLARIFICATION_LIMIT_REACHED',
  );
});

test('invalid clarification answers are rejected safely', () => {
  const learningContext = context({
    mode: 'personalized',
    explicitInput: {
      primaryGoal: 'Learn React',
      goalType: 'learning_goal',
      experienceLevel: 'beginner',
    },
  });
  const decision = service.decide(learningContext);

  assert.throws(
    () => service.respond({ context: learningContext, decision, answer: 0 }),
    (error) => error.code === 'INVALID_CLARIFICATION_RESPONSE',
  );
});

test('response handling rejects a client-tampered question decision', () => {
  const learningContext = context();
  const decision = service.decide(learningContext);
  const tampered = {
    ...decision,
    selectedQuestion: {
      ...decision.selectedQuestion,
      id: 'current-proficiency',
      type: 'multiple_choice',
      targetField: 'currentProficiency',
      options: [
        { label: 'Beginner', value: 'beginner' },
        { label: 'Intermediate', value: 'intermediate' },
      ],
    },
  };

  assert.throws(
    () => service.respond({ context: learningContext, decision: tampered, answer: 'beginner' }),
    (error) => error.code === 'INVALID_CLARIFICATION_DECISION',
  );
});
