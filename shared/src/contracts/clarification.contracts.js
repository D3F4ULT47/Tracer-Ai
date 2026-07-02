import clarificationSchema from '../schemas/ai/clarification.schema.json' with { type: 'json' };
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

const decision = toDraftSevenSchema(clarificationSchema);
const context = toDraftSevenSchema(learningContextSchema);
const decisionDefinitions = toDraftSevenSchema(clarificationSchema.$defs);
const contextDefinitions = toDraftSevenSchema(learningContextSchema.$defs);

export const CLARIFICATION_ENDPOINTS = Object.freeze({
  decide: defineEndpoint({
    id: 'ai.clarifications.decide',
    method: 'POST',
    path: '/ai/clarifications/decide',
    auth: false,
    csrf: false,
    bodySchema: {
      type: 'object',
      required: ['context'],
      properties: { context: { type: 'object' } },
      additionalProperties: false,
    },
    dataSchema: {
      type: 'object',
      definitions: decisionDefinitions,
      required: ['decision'],
      properties: { decision },
      additionalProperties: false,
    },
  }),
  respond: defineEndpoint({
    id: 'ai.clarifications.respond',
    method: 'POST',
    path: '/ai/clarifications/respond',
    auth: false,
    csrf: false,
    bodySchema: {
      type: 'object',
      required: ['context', 'decision', 'answer'],
      properties: {
        context: { type: 'object' },
        decision: { type: 'object' },
        answer: {},
      },
      additionalProperties: false,
    },
    dataSchema: {
      type: 'object',
      definitions: { ...decisionDefinitions, ...contextDefinitions },
      required: ['context', 'decision'],
      properties: { context, decision },
      additionalProperties: false,
    },
  }),
});
