function unresolved(context, field) {
  return context[field]?.status === 'unresolved';
}

function conflicted(context, field) {
  return context[field]?.status === 'conflicted';
}

function clarificationRequested(context, field) {
  return context.clarificationsRequired.value?.some((item) => item.field === field) === true;
}

function options(values) {
  return values.map(([label, value]) => Object.freeze({ label, value }));
}

function provenanceOptions(context, field, fallback) {
  const values = [
    ...new Set(
      (context[field]?.provenance ?? [])
        .map((candidate) => candidate.value)
        .filter((value) => typeof value === 'string' && value.trim()),
    ),
  ];
  return values.length > 1 ? options(values.map((value) => [value, value])) : fallback;
}

function hasFreeResourceConflict(context) {
  if (!conflicted(context, 'constraints')) return false;
  return context.constraints.provenance.some((candidate) =>
    (candidate.value ?? []).some((value) => /free resource/i.test(value)),
  );
}

export const clarificationQuestionRegistry = Object.freeze([
  Object.freeze({
    id: 'primary-goal',
    rank: 110,
    expectedConfidenceGain: 0.35,
    shouldAsk: (context) => unresolved(context, 'primaryGoal'),
    question: 'What would you most like to learn or achieve?',
    type: 'free_text',
    options: () => [],
    reason: 'A clear primary goal materially changes the entire roadmap.',
    affectedFields: ['primaryGoal', 'goalType'],
    targetField: 'primaryGoal',
    normalizeAnswer(answer) {
      if (typeof answer !== 'string' || answer.trim().length < 2) {
        throw new Error('Primary goal answer must contain at least two characters');
      }
      return answer.normalize('NFKC').trim();
    },
  }),
  Object.freeze({
    id: 'current-proficiency',
    rank: 100,
    expectedConfidenceGain: 0.3,
    shouldAsk: (context) =>
      unresolved(context, 'currentProficiency') ||
      conflicted(context, 'currentProficiency') ||
      clarificationRequested(context, 'currentProficiency'),
    question: 'Which level best describes your current experience?',
    type: 'multiple_choice',
    options: () =>
      options([
        ['Beginner', 'beginner'],
        ['Intermediate', 'intermediate'],
        ['Advanced', 'advanced'],
        ['Expert', 'expert'],
      ]),
    reason: 'Starting level directly changes prerequisite depth and task difficulty.',
    affectedFields: ['currentProficiency'],
    targetField: 'currentProficiency',
    normalizeAnswer: (answer) => answer,
  }),
  Object.freeze({
    id: 'weekly-hours',
    rank: 95,
    expectedConfidenceGain: 0.22,
    shouldAsk: (context) =>
      context.mode.value === 'personalized' && unresolved(context, 'weeklyHours'),
    question: 'How many hours can you realistically study each week?',
    type: 'number',
    options: () => [],
    reason: 'Weekly availability materially changes roadmap pacing and workload.',
    affectedFields: ['weeklyHours', 'pace'],
    targetField: 'weeklyHours',
    normalizeAnswer(answer) {
      const value = Number(answer);
      if (!Number.isFinite(value) || value < 1 || value > 168) {
        throw new Error('Weekly hours must be a number between 1 and 168');
      }
      return value;
    },
  }),
  Object.freeze({
    id: 'goal-type',
    rank: 90,
    expectedConfidenceGain: 0.25,
    shouldAsk: (context) =>
      conflicted(context, 'goalType') ||
      (context.mode.value === 'personalized' && unresolved(context, 'goalType')),
    question: 'Is your main goal to get a job, learn a skill, or build a project?',
    type: 'multiple_choice',
    options: () =>
      options([
        ['Get a job', 'career_goal'],
        ['Learn a skill', 'learning_goal'],
        ['Build a project', 'project'],
      ]),
    reason: 'Goal type changes the balance of theory, projects, and interview preparation.',
    affectedFields: ['goalType', 'careerGoal', 'projectGoal'],
    targetField: 'goalType',
    normalizeAnswer: (answer) => answer,
  }),
  Object.freeze({
    id: 'target-deadline',
    rank: 85,
    expectedConfidenceGain: 0.2,
    shouldAsk: (context) =>
      ['certification', 'interview'].includes(context.goalType.value) &&
      unresolved(context, 'targetDeadline'),
    question: 'What date are you working toward?',
    type: 'date',
    options: () => [],
    reason: 'A fixed interview or certification date materially changes roadmap pacing.',
    affectedFields: ['targetDeadline', 'pace'],
    targetField: 'targetDeadline',
    normalizeAnswer(answer) {
      if (typeof answer !== 'string' || Number.isNaN(Date.parse(answer))) {
        throw new Error('Target deadline must be a valid date');
      }
      return answer;
    },
  }),
  Object.freeze({
    id: 'resource-language',
    rank: 75,
    expectedConfidenceGain: 0.12,
    shouldAsk: (context) => conflicted(context, 'preferredResourceLanguage'),
    question: 'Which language should your learning resources use?',
    type: 'dropdown',
    options: (context) =>
      provenanceOptions(
        context,
        'preferredResourceLanguage',
        options([
          ['English', 'English'],
          ['Hindi', 'Hindi'],
          ['Spanish', 'Spanish'],
        ]),
      ),
    reason: 'Conflicting resource-language preferences affect every recommended resource.',
    affectedFields: ['preferredResourceLanguage'],
    targetField: 'preferredResourceLanguage',
    normalizeAnswer: (answer) => answer,
  }),
  Object.freeze({
    id: 'learning-style',
    rank: 65,
    expectedConfidenceGain: 0.08,
    shouldAsk: (context) => conflicted(context, 'learningStyle'),
    question: 'How do you prefer to learn?',
    type: 'dropdown',
    options: (context) =>
      provenanceOptions(
        context,
        'learningStyle',
        options([
          ['Hands-on projects', 'project-based'],
          ['Guided lessons', 'guided'],
          ['Reading and practice', 'reading-and-practice'],
        ]),
      ),
    reason: 'A conflicting learning style changes how tasks and explanations should be presented.',
    affectedFields: ['learningStyle'],
    targetField: 'learningStyle',
    normalizeAnswer: (answer) => answer,
  }),
  Object.freeze({
    id: 'free-resources',
    rank: 60,
    expectedConfidenceGain: 0.06,
    shouldAsk: hasFreeResourceConflict,
    question: 'Should the roadmap use only free resources?',
    type: 'boolean',
    options: () =>
      options([
        ['Yes', true],
        ['No', false],
      ]),
    reason: 'Conflicting cost constraints change which resources can be selected.',
    affectedFields: ['constraints', 'budget'],
    targetField: 'constraints',
    normalizeAnswer(answer, context) {
      if (typeof answer !== 'boolean') throw new Error('Free-resource answer must be boolean');
      const current = Array.isArray(context.constraints.value) ? context.constraints.value : [];
      const withoutFreeOnly = current.filter((value) => !/free resource/i.test(value));
      return answer ? [...withoutFreeOnly, 'Use only free resources'] : withoutFreeOnly;
    },
  }),
]);

export function getClarificationQuestionDefinition(id) {
  return clarificationQuestionRegistry.find((question) => question.id === id);
}
