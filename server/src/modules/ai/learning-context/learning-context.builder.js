import { createCandidate, resolveContextField } from './context-field.js';

export const LEARNING_CONTEXT_FIELD_NAMES = Object.freeze([
  'mode',
  'primaryGoal',
  'goalType',
  'careerGoal',
  'projectGoal',
  'currentProficiency',
  'knownSkills',
  'missingSkills',
  'technologyStack',
  'learningStyle',
  'weeklyHours',
  'preferredLanguage',
  'preferredResourceLanguage',
  'preferredPlatforms',
  'preferredCreators',
  'budget',
  'targetDeadline',
  'preferredRoadmapStyle',
  'difficultyPreference',
  'pace',
  'existingExperience',
  'education',
  'careerDirection',
  'constraints',
]);

const preferenceFields = Object.freeze([
  'learningStyle',
  'weeklyHours',
  'preferredLanguage',
  'preferredResourceLanguage',
  'preferredPlatforms',
  'preferredCreators',
  'budget',
  'targetDeadline',
  'preferredRoadmapStyle',
  'difficultyPreference',
  'pace',
  'constraints',
]);

const learningProfileFieldMap = Object.freeze({
  learningStyle: 'learningStyle',
  weeklyHours: 'weeklyHours',
  preferredLanguage: 'preferredLanguage',
  preferredPlatforms: 'preferredPlatforms',
  preferredCreators: 'preferredCreators',
  budget: 'budget',
  preferredRoadmapStyle: 'preferredRoadmapStyle',
  learningPace: 'pace',
});

function normalizeString(value) {
  return typeof value === 'string' ? value.normalize('NFKC').trim() : value;
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) return value;
  return [...new Set(value.map(normalizeString).filter(Boolean))];
}

function evidence(source, excerpt) {
  const normalized = normalizeString(excerpt);
  return normalized ? Object.freeze({ source, excerpt: normalized.slice(0, 500) }) : null;
}

function directEvidence(source, value) {
  const values = Array.isArray(value) ? value : [value];
  return values
    .slice(0, 20)
    .map((item) => evidence(source, typeof item === 'object' ? JSON.stringify(item) : String(item)))
    .filter(Boolean);
}

function addCandidate(candidates, field, data) {
  if (
    !LEARNING_CONTEXT_FIELD_NAMES.includes(field) ||
    data.value === undefined ||
    data.value === null
  )
    return;
  candidates[field].push(createCandidate(data));
}

function addDirectFields(
  candidates,
  values,
  source,
  fields,
  fieldMap = {},
  { includeEmptyArrays = true } = {},
) {
  for (const sourceField of fields) {
    if (!(sourceField in values)) continue;
    if (
      !includeEmptyArrays &&
      Array.isArray(values[sourceField]) &&
      values[sourceField].length === 0
    )
      continue;
    const field = fieldMap[sourceField] ?? sourceField;
    const value = Array.isArray(values[sourceField])
      ? normalizeStringList(values[sourceField])
      : normalizeString(values[sourceField]);
    addCandidate(candidates, field, {
      source,
      value,
      confidence: 1,
      evidence: directEvidence(source, value),
      reasoning: `${field} was supplied directly by ${source}.`,
    });
  }
}

function normalizeSkill(skill, source, fallbackConfidence) {
  if (typeof skill === 'string') {
    const name = normalizeString(skill);
    return {
      name,
      category: null,
      confidence: fallbackConfidence,
      evidence: directEvidence(source, name),
    };
  }

  const skillEvidence = Array.isArray(skill.evidence)
    ? skill.evidence.map((item) => evidence(source, item.excerpt ?? item)).filter(Boolean)
    : [evidence(source, skill.evidence)].filter(Boolean);
  return {
    name: normalizeString(skill.name),
    category: skill.category ?? null,
    confidence: skill.confidence ?? fallbackConfidence,
    evidence: skillEvidence,
  };
}

function normalizeSkills(skills, source, fallbackConfidence) {
  if (!Array.isArray(skills)) return undefined;
  const normalized = skills.map((skill) => normalizeSkill(skill, source, fallbackConfidence));
  return [
    ...new Map(
      normalized.filter((skill) => skill.name).map((skill) => [skill.name.toLowerCase(), skill]),
    ).values(),
  ];
}

function inferenceValue(inference) {
  return Array.isArray(inference.value) ? normalizeStringList(inference.value) : inference.value;
}

function mapLearningProfileInferences(candidates, inferences = []) {
  const assumptions = [];
  for (const inference of inferences) {
    const field = learningProfileFieldMap[inference.field] ?? inference.field;
    if (!LEARNING_CONTEXT_FIELD_NAMES.includes(field)) continue;
    const value = inferenceValue(inference);
    addCandidate(candidates, field, {
      source: 'ai_inference',
      value,
      confidence: inference.aiConfidence,
      evidence: directEvidence('ai_inference', inference.aiSource),
      reasoning: `Stored AI inference from ${inference.aiSource}.`,
    });
    assumptions.push({
      field,
      value,
      source: 'ai_inference',
      confidence: inference.aiConfidence,
      reasoning: `Stored AI inference from ${inference.aiSource}.`,
    });
  }
  return assumptions;
}

function addAssessmentCandidates(candidates, assessment) {
  const assessmentEvidence = assessment.proficiencyEvidence
    .map((item) => evidence('ai_assessment', item.excerpt))
    .filter(Boolean);
  addCandidate(candidates, 'currentProficiency', {
    source: 'ai_assessment',
    value: assessment.currentLevel,
    confidence: assessment.confidence,
    evidence: assessmentEvidence,
    reasoning: assessment.reasoning,
  });

  for (const [field, assessmentField] of [
    ['knownSkills', 'knownSkills'],
    ['missingSkills', 'missingSkills'],
    ['technologyStack', 'technologyStack'],
  ]) {
    addCandidate(candidates, field, {
      source: 'ai_assessment',
      value: normalizeSkills(assessment[assessmentField], 'ai_assessment', assessment.confidence),
      confidence: assessment.confidence,
      evidence: assessmentEvidence,
      reasoning: `${field} came from the validated learner assessment.`,
    });
  }

  for (const [field, assessmentField, asList] of [
    ['careerDirection', 'careerDirection', false],
    ['existingExperience', 'experienceSummary', true],
    ['education', 'educationSummary', true],
  ]) {
    const inference = assessment[assessmentField];
    if (!inference?.inferred || inference.value == null) continue;
    addCandidate(candidates, field, {
      source: 'ai_assessment',
      value: asList ? [normalizeString(inference.value)] : normalizeString(inference.value),
      confidence: inference.confidence,
      evidence: inference.evidence
        .map((item) => evidence('ai_assessment', item.excerpt))
        .filter(Boolean),
      reasoning: inference.reasoning,
    });
  }
}

function addResumeCandidates(candidates, resumeAnalysis) {
  if (!resumeAnalysis) return;
  const confidence = resumeAnalysis.confidence;
  addCandidate(candidates, 'currentProficiency', {
    source: 'resume_analysis',
    value: resumeAnalysis.currentLevel,
    confidence,
    evidence: directEvidence('resume_analysis', resumeAnalysis.experience),
    reasoning: 'Proficiency was extracted from the validated resume analysis.',
  });
  addCandidate(candidates, 'knownSkills', {
    source: 'resume_analysis',
    value: normalizeSkills(resumeAnalysis.skills, 'resume_analysis', confidence),
    confidence,
    evidence: directEvidence(
      'resume_analysis',
      resumeAnalysis.skills.map((skill) => skill.evidence),
    ),
    reasoning: 'Known skills were extracted from the validated resume analysis.',
  });
  addCandidate(candidates, 'technologyStack', {
    source: 'resume_analysis',
    value: normalizeSkills(
      [...resumeAnalysis.technologies, ...resumeAnalysis.tools],
      'resume_analysis',
      confidence,
    ),
    confidence,
    evidence: directEvidence('resume_analysis', [
      ...resumeAnalysis.technologies,
      ...resumeAnalysis.tools,
    ]),
    reasoning: 'Technology stack was extracted from the validated resume analysis.',
  });
  for (const [field, value] of [
    ['existingExperience', resumeAnalysis.experience],
    ['education', resumeAnalysis.education],
  ]) {
    addCandidate(candidates, field, {
      source: 'resume_analysis',
      value: normalizeStringList(value),
      confidence,
      evidence: directEvidence('resume_analysis', value),
      reasoning: `${field} was extracted from the validated resume analysis.`,
    });
  }
}

function addDerivedGoalCandidates(candidates, values, source) {
  if (!values.primaryGoal && values.careerGoal) {
    addCandidate(candidates, 'primaryGoal', {
      source,
      value: normalizeString(values.careerGoal),
      confidence: 1,
      evidence: directEvidence(source, values.careerGoal),
      reasoning: `The career goal supplied by ${source} is the primary goal.`,
    });
  }
  if (!values.primaryGoal && values.projectGoal) {
    addCandidate(candidates, 'primaryGoal', {
      source,
      value: normalizeString(values.projectGoal),
      confidence: 1,
      evidence: directEvidence(source, values.projectGoal),
      reasoning: `The project goal supplied by ${source} is the primary goal.`,
    });
  }
  if (!values.goalType && values.careerGoal) {
    addCandidate(candidates, 'goalType', {
      source,
      value: 'career_goal',
      confidence: 1,
      evidence: directEvidence(source, values.careerGoal),
      reasoning: `Goal type follows from the career goal supplied by ${source}.`,
    });
  }
  if (!values.goalType && values.projectGoal) {
    addCandidate(candidates, 'goalType', {
      source,
      value: 'project',
      confidence: 1,
      evidence: directEvidence(source, values.projectGoal),
      reasoning: `Goal type follows from the project goal supplied by ${source}.`,
    });
  }
}

function uniqueEvidence(items) {
  return [...new Map(items.map((item) => [`${item.source}:${item.excerpt}`, item])).values()];
}

function deriveAssumptions(resolvedFields, storedAssumptions, derivedAssumptions) {
  const assumptions = [...storedAssumptions, ...derivedAssumptions];
  for (const [field, contextField] of Object.entries(resolvedFields)) {
    const provenance = contextField.provenance.find((candidate) => candidate.selected);
    if (
      !provenance ||
      !['ai_assessment', 'ai_inference', 'system_default'].includes(provenance.source)
    ) {
      continue;
    }
    assumptions.push({
      field,
      value: contextField.value,
      source: provenance.source,
      confidence: contextField.confidence,
      reasoning: provenance.reasoning,
    });
  }
  return [
    ...new Map(
      assumptions.map((item) => [`${item.field}:${JSON.stringify(item.value)}`, item]),
    ).values(),
  ];
}

function deriveClarifications(fields, assessment) {
  const clarifications = [];
  if (fields.primaryGoal.status === 'unresolved') {
    clarifications.push({
      field: 'primaryGoal',
      reason: 'A learning goal is required before planning can begin.',
      priority: 'high',
    });
  }
  if (fields.currentProficiency.status === 'unresolved' || assessment.clarificationRequired) {
    clarifications.push({
      field: 'currentProficiency',
      reason: 'Current proficiency is uncertain enough to materially change the learning plan.',
      priority: 'high',
    });
  }
  if (fields.weeklyHours.status === 'unresolved') {
    clarifications.push({
      field: 'weeklyHours',
      reason: 'Weekly availability is unresolved and may affect roadmap pacing.',
      priority: 'medium',
    });
  }
  if (fields.currentProficiency.status === 'conflicted') {
    clarifications.push({
      field: 'currentProficiency',
      reason:
        'User-selected proficiency conflicts with another source; the user value remains selected.',
      priority: 'low',
    });
  }
  return clarifications;
}

export function buildLearningContext({
  assessment,
  mode,
  explicitInput = {},
  questionnaire = {},
  profile,
  learningProfile,
  resumeAnalysis,
  sourceVersions = {},
  systemDefaults = {},
}) {
  const candidates = Object.fromEntries(LEARNING_CONTEXT_FIELD_NAMES.map((field) => [field, []]));

  addCandidate(candidates, 'mode', {
    source: mode ? 'explicit_user' : 'system_default',
    value: mode ?? 'quick',
    confidence: 1,
    evidence: directEvidence(mode ? 'explicit_user' : 'system_default', mode ?? 'quick'),
    reasoning: mode
      ? 'The learner selected this roadmap creation mode.'
      : 'Quick mode is the approved default creation mode.',
  });

  addDirectFields(candidates, explicitInput, 'explicit_user', [
    'primaryGoal',
    'goalType',
    'careerGoal',
    'projectGoal',
    'knownSkills',
    'existingExperience',
    'education',
    ...preferenceFields,
  ]);
  if ('experienceLevel' in explicitInput) {
    addCandidate(candidates, 'currentProficiency', {
      source: 'explicit_user',
      value: explicitInput.experienceLevel,
      confidence: 1,
      evidence: directEvidence('explicit_user', explicitInput.experienceLevel),
      reasoning: 'The learner explicitly selected this experience level.',
    });
  }
  addDerivedGoalCandidates(candidates, explicitInput, 'explicit_user');
  addDirectFields(candidates, questionnaire, 'questionnaire', [
    'careerGoal',
    'projectGoal',
    'knownSkills',
    'existingExperience',
    'education',
    ...preferenceFields,
  ]);
  if ('experienceLevel' in questionnaire) {
    addCandidate(candidates, 'currentProficiency', {
      source: 'questionnaire',
      value: questionnaire.experienceLevel,
      confidence: 1,
      evidence: directEvidence('questionnaire', questionnaire.experienceLevel),
      reasoning: 'The learner selected this experience level in the questionnaire.',
    });
  }
  addDerivedGoalCandidates(candidates, questionnaire, 'questionnaire');
  addDirectFields(
    candidates,
    profile,
    'user_profile',
    ['skills', 'education', 'experience'],
    {
      skills: 'knownSkills',
      experience: 'existingExperience',
    },
    { includeEmptyArrays: false },
  );
  addDirectFields(
    candidates,
    learningProfile,
    'learning_profile',
    Object.keys(learningProfileFieldMap),
    learningProfileFieldMap,
    { includeEmptyArrays: false },
  );
  const storedAssumptions = mapLearningProfileInferences(candidates, learningProfile.inferences);
  addResumeCandidates(candidates, resumeAnalysis);
  addAssessmentCandidates(candidates, assessment);
  addDirectFields(
    candidates,
    systemDefaults,
    'system_default',
    LEARNING_CONTEXT_FIELD_NAMES,
    {},
    {
      includeEmptyArrays: false,
    },
  );
  for (const field of ['knownSkills', 'missingSkills', 'technologyStack']) {
    candidates[field] = candidates[field].map((candidate) =>
      createCandidate({
        ...candidate,
        value: normalizeSkills(candidate.value, candidate.source, candidate.confidence),
      }),
    );
  }

  const preferredLanguagePreview = resolveContextField(
    'preferredLanguage',
    candidates.preferredLanguage,
  );
  const derivedAssumptions = [];
  if (
    candidates.preferredResourceLanguage.length === 0 &&
    preferredLanguagePreview.status !== 'unresolved'
  ) {
    addCandidate(candidates, 'preferredResourceLanguage', {
      source: 'system_derived',
      value: preferredLanguagePreview.value,
      confidence: 0.8,
      evidence: preferredLanguagePreview.evidence,
      reasoning:
        'Resource language follows the selected preferred language until specified separately.',
    });
    derivedAssumptions.push({
      field: 'preferredResourceLanguage',
      value: preferredLanguagePreview.value,
      source: 'system_derived',
      confidence: 0.8,
      reasoning:
        'Resource language follows the selected preferred language until specified separately.',
    });
  }

  const resolvedFields = Object.fromEntries(
    LEARNING_CONTEXT_FIELD_NAMES.map((field) => [
      field,
      resolveContextField(field, candidates[field]),
    ]),
  );
  const selectedEvidence = uniqueEvidence(
    Object.values(resolvedFields).flatMap((field) => field.evidence),
  ).slice(0, 100);
  const resolvedForConfidence = Object.values(resolvedFields).filter(
    (field) => field.status !== 'unresolved',
  );
  const overallConfidence =
    resolvedForConfidence.length === 0
      ? 0
      : Number(
          (
            resolvedForConfidence.reduce((sum, field) => sum + field.confidence, 0) /
            resolvedForConfidence.length
          ).toFixed(4),
        );
  const assumptions = deriveAssumptions(resolvedFields, storedAssumptions, derivedAssumptions);
  const clarifications = deriveClarifications(resolvedFields, assessment);

  return Object.freeze({
    schemaVersion: '1.0.0',
    contextVersion: (sourceVersions.previousContextVersion ?? 0) + 1,
    generatedAt: new Date().toISOString(),
    generatedFrom: Object.freeze({
      profileVersion: Number.isInteger(profile.__v) ? profile.__v : null,
      learningProfileVersion: Number.isInteger(learningProfile.__v) ? learningProfile.__v : null,
      resumeVersion: sourceVersions.resumeVersion ?? null,
      assessmentVersion: sourceVersions.assessmentVersion ?? assessment.schemaVersion,
      clarificationVersion: 0,
    }),
    clarificationState: Object.freeze({
      questionAsked: false,
      questionId: null,
      answeredAt: null,
    }),
    ...resolvedFields,
    confidence: resolveContextField('confidence', [
      createCandidate({
        source: 'system_derived',
        value: overallConfidence,
        confidence: 1,
        evidence: selectedEvidence,
        reasoning: 'Overall confidence is the mean confidence of all resolved context fields.',
      }),
    ]),
    evidence: resolveContextField('evidence', [
      createCandidate({
        source: 'system_derived',
        value: selectedEvidence,
        confidence: overallConfidence,
        evidence: selectedEvidence,
        reasoning: 'Evidence aggregates the evidence supporting selected context values.',
      }),
    ]),
    assumptions: resolveContextField('assumptions', [
      createCandidate({
        source: 'system_derived',
        value: assumptions,
        confidence:
          assumptions.length === 0 ? 1 : Math.min(...assumptions.map((item) => item.confidence)),
        evidence: [],
        reasoning: 'Assumptions enumerate selected inferred, derived, or default values.',
      }),
    ]),
    clarificationsRequired: resolveContextField('clarificationsRequired', [
      createCandidate({
        source: 'system_derived',
        value: clarifications,
        confidence: 1,
        evidence: [],
        reasoning: 'Clarifications identify unresolved or materially conflicting context fields.',
      }),
    ]),
  });
}
