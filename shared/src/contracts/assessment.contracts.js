import learnerAssessmentSchema from '../schemas/ai/learner-assessment.schema.json' with { type: 'json' };
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

const assessmentResponseSchema = toDraftSevenSchema(learnerAssessmentSchema);
const assessmentDefinitions = toDraftSevenSchema(learnerAssessmentSchema.$defs);

const inputProperties = {
  naturalLanguage: { type: 'string', minLength: 1, maxLength: 20_000 },
  projectDescription: { type: 'string', minLength: 1, maxLength: 20_000 },
  resumeText: { type: 'string', minLength: 1, maxLength: 200_000 },
};

export const ASSESSMENT_ENDPOINTS = Object.freeze({
  create: defineEndpoint({
    id: 'ai.assessments.create',
    method: 'POST',
    path: '/ai/assessments',
    auth: false,
    csrf: false,
    bodySchema: {
      type: 'object',
      required: ['inputs'],
      properties: {
        inputs: {
          type: 'object',
          minProperties: 1,
          properties: inputProperties,
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    dataSchema: {
      type: 'object',
      definitions: assessmentDefinitions,
      required: ['assessment', 'runId'],
      properties: {
        assessment: assessmentResponseSchema,
        runId: { type: 'string' },
      },
      additionalProperties: false,
    },
  }),
});
