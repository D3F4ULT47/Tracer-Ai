import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAiOutput } from '../src/modules/ai/json.validator.js';
import { buildLearningContext } from '../src/modules/ai/learning-context/learning-context.builder.js';
import { createLearningContextService } from '../src/modules/ai/learning-context/learning-context.service.js';

function evidence(source, excerpt) {
  return { source, excerpt };
}

function optionalInference({ value = null, excerpt = 'Built a React dashboard' } = {}) {
  return value == null
    ? {
        inferred: false,
        value: null,
        confidence: 0,
        reasoning: 'No supporting evidence was supplied.',
        evidence: [],
      }
    : {
        inferred: true,
        value,
        confidence: 0.8,
        reasoning: 'The input supports this inference.',
        evidence: [evidence('naturalLanguage', excerpt)],
      };
}

function skill(name, confidence = 0.85) {
  return {
    name,
    category: 'programming',
    confidence,
    reasoning: `${name} is supported by the learner input.`,
    evidence: [evidence('naturalLanguage', 'Built a React dashboard')],
  };
}

function assessment(overrides = {}) {
  return {
    schemaVersion: '1.0.0',
    currentLevel: 'intermediate',
    confidence: 0.82,
    reasoning: 'Applied project work supports intermediate proficiency.',
    proficiencyEvidence: [evidence('naturalLanguage', 'Built a React dashboard')],
    knownSkills: [skill('React')],
    missingSkills: [skill('Testing', 0.7)],
    suggestedSkills: [],
    experienceSignals: [],
    educationSignals: [],
    technologyStack: [skill('React')],
    careerDirection: optionalInference({ value: 'Frontend engineering' }),
    projectComplexity: optionalInference({ value: 'moderate' }),
    experienceSummary: optionalInference({ value: 'Built a production dashboard.' }),
    educationSummary: optionalInference(),
    technologySummary: optionalInference({ value: 'Applied React experience.' }),
    clarificationRequired: false,
    ...overrides,
  };
}

function profile(overrides = {}) {
  return {
    skills: ['JavaScript'],
    education: ['Bachelor of Technology'],
    experience: ['Frontend internship'],
    ...overrides,
  };
}

function learningProfile(overrides = {}) {
  return {
    preferredLanguage: 'English',
    preferredPlatforms: ['YouTube'],
    preferredCreators: [],
    learningPace: 'balanced',
    weeklyHours: 12,
    inferences: [],
    ...overrides,
  };
}

function resumeAnalysis(overrides = {}) {
  return {
    skills: [{ name: 'React', confidence: 0.9, evidence: 'Built React applications' }],
    experience: ['Three years as a frontend engineer'],
    projects: ['Analytics dashboard'],
    education: ['Bachelor of Technology'],
    certifications: [],
    tools: ['Git'],
    technologies: ['React'],
    currentLevel: 'advanced',
    confidence: 0.78,
    ...overrides,
  };
}

test('Learning Context validates and every field contains provenance', () => {
  const context = buildLearningContext({
    assessment: assessment(),
    mode: 'personalized',
    explicitInput: {
      primaryGoal: 'Become a frontend engineer',
      goalType: 'career_goal',
      experienceLevel: 'beginner',
      weeklyHours: 6,
    },
    questionnaire: { weeklyHours: 8, learningStyle: 'project-based' },
    profile: profile({ __v: 2 }),
    learningProfile: learningProfile({ __v: 4 }),
    resumeAnalysis: resumeAnalysis(),
    sourceVersions: {
      resumeVersion: 3,
      assessmentVersion: '1.0.0',
      previousContextVersion: 3,
    },
  });

  assert.equal(validateAiOutput('learningContext', context), context);
  assert.equal(context.contextVersion, 4);
  assert.ok(Date.parse(context.generatedAt));
  assert.deepEqual(context.generatedFrom, {
    profileVersion: 2,
    learningProfileVersion: 4,
    resumeVersion: 3,
    assessmentVersion: '1.0.0',
    clarificationVersion: 0,
  });
  assert.equal(context.mode.value, 'personalized');
  assert.equal(context.weeklyHours.value, 6);
  assert.equal(context.weeklyHours.provenance[0].source, 'explicit_user');
  for (const [field, value] of Object.entries(context)) {
    if (
      [
        'schemaVersion',
        'contextVersion',
        'generatedAt',
        'generatedFrom',
        'clarificationState',
      ].includes(field)
    )
      continue;
    assert.ok(value.provenance.length > 0, `${field} must contain provenance`);
  }
  for (const prohibited of ['tasks', 'roadmap', 'weeks', 'resources', 'phases', 'timeline']) {
    assert.equal(prohibited in context, false);
  }
});

test('explicit values win while conflicting values remain preserved', () => {
  const context = buildLearningContext({
    assessment: assessment(),
    explicitInput: { primaryGoal: 'Learn frontend engineering', experienceLevel: 'beginner' },
    questionnaire: { weeklyHours: 8 },
    profile: profile(),
    learningProfile: learningProfile({ weeklyHours: 12 }),
    resumeAnalysis: resumeAnalysis({ currentLevel: 'advanced' }),
  });

  assert.equal(context.currentProficiency.value, 'beginner');
  assert.equal(context.currentProficiency.status, 'conflicted');
  assert.equal(context.currentProficiency.provenance[0].source, 'explicit_user');
  assert.ok(
    context.currentProficiency.conflicts.some(
      (conflict) =>
        conflict.conflictingSource === 'resume_analysis' &&
        conflict.conflictingValue === 'advanced',
    ),
  );
  assert.equal(context.weeklyHours.value, 8);
  assert.equal(context.weeklyHours.provenance[0].source, 'questionnaire');
  assert.ok(context.weeklyHours.provenance.some((item) => item.source === 'learning_profile'));
});

test('profile values outrank resume and AI while preserving their evidence', () => {
  const context = buildLearningContext({
    assessment: assessment(),
    explicitInput: { primaryGoal: 'Improve frontend skills' },
    profile: profile({ skills: ['JavaScript'] }),
    learningProfile: learningProfile(),
    resumeAnalysis: resumeAnalysis(),
  });

  assert.deepEqual(
    context.knownSkills.value.map(({ name }) => name),
    ['JavaScript'],
  );
  assert.equal(context.knownSkills.provenance[0].source, 'user_profile');
  assert.ok(context.knownSkills.provenance.some((item) => item.source === 'resume_analysis'));
  assert.ok(context.knownSkills.provenance.some((item) => item.source === 'ai_assessment'));
  assert.equal(
    context.knownSkills.provenance.find((item) => item.source === 'ai_assessment').confidence,
    0.82,
  );
});

test('empty stored profile defaults do not erase assessment evidence', () => {
  const context = buildLearningContext({
    assessment: assessment(),
    explicitInput: { primaryGoal: 'Improve frontend skills' },
    profile: profile({ skills: [], education: [], experience: [] }),
    learningProfile: learningProfile({ preferredPlatforms: [], preferredCreators: [] }),
  });

  assert.deepEqual(
    context.knownSkills.value.map(({ name }) => name),
    ['React'],
  );
  assert.equal(context.knownSkills.provenance[0].source, 'ai_assessment');
  assert.equal(context.preferredCreators.status, 'unresolved');
});

test('missing important values remain unresolved and create clarification metadata', () => {
  const context = buildLearningContext({
    assessment: assessment({ confidence: 0.4, clarificationRequired: true }),
    profile: profile({ skills: [], education: [], experience: [] }),
    learningProfile: learningProfile({ weeklyHours: undefined }),
  });

  assert.equal(context.primaryGoal.status, 'unresolved');
  assert.equal(context.primaryGoal.value, null);
  assert.equal(context.primaryGoal.provenance[0].source, 'system_derived');
  assert.ok(
    context.clarificationsRequired.value.some(
      (clarification) => clarification.field === 'primaryGoal' && clarification.priority === 'high',
    ),
  );
  assert.ok(
    context.clarificationsRequired.value.some(
      (clarification) => clarification.field === 'weeklyHours',
    ),
  );
});

test('stored AI inferences and safe derivations remain explicit assumptions', () => {
  const context = buildLearningContext({
    assessment: assessment(),
    explicitInput: { primaryGoal: 'Improve frontend skills' },
    profile: profile(),
    learningProfile: learningProfile({
      preferredLanguage: 'Hindi',
      inferences: [
        {
          field: 'difficultyPreference',
          value: 'challenging',
          aiConfidence: 0.62,
          aiSource: 'Previous learner preference analysis',
        },
      ],
    }),
  });

  assert.equal(context.preferredResourceLanguage.value, 'Hindi');
  assert.equal(context.preferredResourceLanguage.provenance[0].source, 'system_derived');
  assert.equal(context.difficultyPreference.value, 'challenging');
  assert.equal(context.difficultyPreference.confidence, 0.62);
  assert.ok(
    context.assumptions.value.some(
      (assumption) =>
        assumption.field === 'difficultyPreference' && assumption.source === 'ai_inference',
    ),
  );
});

test('Learning Context service synchronizes from current profiles on every build', async () => {
  let currentProfile = profile({ skills: ['JavaScript'] });
  const service = createLearningContextService({
    repository: {
      async getProfiles() {
        return { profile: currentProfile, learningProfile: learningProfile() };
      },
    },
  });
  const input = {
    ownerId: '507f1f77bcf86cd799439011',
    assessment: assessment(),
    mode: 'quick',
    explicitInput: { primaryGoal: 'Become a frontend engineer' },
  };

  const first = await service.create(input);
  currentProfile = profile({ skills: ['TypeScript'] });
  const second = await service.create(input);

  assert.deepEqual(
    first.knownSkills.value.map(({ name }) => name),
    ['JavaScript'],
  );
  assert.deepEqual(
    second.knownSkills.value.map(({ name }) => name),
    ['TypeScript'],
  );
});

test('system defaults remain lower priority than learner-provided sources', () => {
  const context = buildLearningContext({
    assessment: assessment(),
    explicitInput: { primaryGoal: 'Become a frontend engineer' },
    questionnaire: { weeklyHours: 9 },
    profile: profile(),
    learningProfile: learningProfile({ weeklyHours: undefined }),
    systemDefaults: { weeklyHours: 4 },
  });

  assert.equal(context.weeklyHours.value, 9);
  assert.deepEqual(
    context.weeklyHours.provenance.map(({ source }) => source),
    ['questionnaire', 'system_default'],
  );
});

test('anonymous Learning Context uses safe empty profile sources', async () => {
  const service = createLearningContextService({
    repository: {
      async getProfiles() {
        throw new Error('Anonymous context must not query user profiles');
      },
    },
  });
  const context = await service.create({
    ownerId: null,
    assessment: assessment(),
    mode: 'quick',
    explicitInput: {
      primaryGoal: 'Learn frontend engineering',
      goalType: 'learning_goal',
      experienceLevel: 'intermediate',
    },
  });
  assert.equal(context.primaryGoal.value, 'Learn frontend engineering');
  assert.equal(context.mode.value, 'quick');
});
