import learningContextSchema from '../schemas/ai/learning-context.schema.json' with { type: 'json' };
import { defineEndpoint } from './endpoint.js';

function toDraftSevenSchema(value) {
  if (Array.isArray(value)) return value.map(toDraftSevenSchema);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !['$schema', '$id', '$defs'].includes(key))
      .map(([key, entry]) => [
        key,
        key === '$ref'
          ? entry.replace('#/$defs/', '#/properties/data/definitions/')
          : toDraftSevenSchema(entry),
      ]),
  );
}

const nullableString = { type: ['string', 'null'], maxLength: 20_000 };
const stringList = {
  type: 'array',
  maxItems: 200,
  items: { type: 'string', maxLength: 500 },
};
const skillList = {
  type: 'array',
  maxItems: 200,
  items: { type: 'string', minLength: 1, maxLength: 100 },
};
const preferenceProperties = {
  learningStyle: nullableString,
  weeklyHours: { type: ['number', 'null'], minimum: 1, maximum: 168 },
  preferredLanguage: nullableString,
  preferredResourceLanguage: nullableString,
  preferredPlatforms: stringList,
  preferredCreators: stringList,
  budget: { type: ['number', 'null'], minimum: 0 },
  targetDeadline: nullableString,
  preferredRoadmapStyle: nullableString,
  difficultyPreference: nullableString,
  pace: { type: ['string', 'null'], enum: ['slow', 'balanced', 'fast', null] },
  constraints: stringList,
};

const explicitInputSchema = {
  type: 'object',
  properties: {
    primaryGoal: nullableString,
    goalType: {
      type: ['string', 'null'],
      enum: [
        'career_goal',
        'learning_goal',
        'project',
        'certification',
        'interview',
        'other',
        null,
      ],
    },
    careerGoal: nullableString,
    projectGoal: nullableString,
    experienceLevel: {
      type: ['string', 'null'],
      enum: ['beginner', 'intermediate', 'advanced', 'expert', null],
    },
    knownSkills: skillList,
    existingExperience: stringList,
    education: stringList,
    ...preferenceProperties,
  },
  additionalProperties: false,
};

const questionnaireSchema = {
  type: 'object',
  properties: {
    careerGoal: nullableString,
    projectGoal: nullableString,
    experienceLevel: {
      type: ['string', 'null'],
      enum: ['beginner', 'intermediate', 'advanced', 'expert', null],
    },
    knownSkills: skillList,
    existingExperience: stringList,
    education: stringList,
    ...preferenceProperties,
  },
  additionalProperties: false,
};

const contextResponseSchema = toDraftSevenSchema(learningContextSchema);
const contextDefinitions = toDraftSevenSchema(learningContextSchema.$defs);

export const LEARNING_CONTEXT_ENDPOINTS = Object.freeze({
  create: defineEndpoint({
    id: 'ai.learning-contexts.create',
    method: 'POST',
    path: '/ai/learning-contexts',
    auth: false,
    csrf: false,
    bodySchema: {
      type: 'object',
      required: ['assessment', 'mode'],
      properties: {
        assessment: { type: 'object' },
        mode: { enum: ['quick', 'personalized'] },
        explicitInput: explicitInputSchema,
        questionnaire: questionnaireSchema,
        resumeAnalysis: { type: 'object' },
        sourceVersions: {
          type: 'object',
          properties: {
            resumeVersion: { type: ['integer', 'null'], minimum: 1 },
            assessmentVersion: { type: 'string', minLength: 1 },
            previousContextVersion: { type: 'integer', minimum: 1 },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    dataSchema: {
      type: 'object',
      definitions: contextDefinitions,
      required: ['context'],
      properties: { context: contextResponseSchema },
      additionalProperties: false,
    },
  }),
});
