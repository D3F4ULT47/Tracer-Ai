import { defineEndpoint } from './endpoint.js';

const classificationSchema = {
  type: 'object',
  required: ['type', 'confidence', 'signals'],
  properties: {
    type: { enum: ['career_goal', 'learning_goal', 'project', 'resume', 'pdf'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    signals: { type: 'array', maxItems: 10, items: { type: 'string' } },
  },
  additionalProperties: false,
};

const ingestionSchema = {
  type: 'object',
  required: ['inputType', 'normalizedText', 'classification', 'metadata'],
  properties: {
    inputType: { enum: ['natural_language', 'project_description', 'resume', 'pdf'] },
    normalizedText: { type: 'string' },
    classification: classificationSchema,
    metadata: {
      type: 'object',
      required: ['characterCount', 'inputHash'],
      properties: {
        characterCount: { type: 'integer', minimum: 1 },
        inputHash: { type: 'string', pattern: '^[a-f0-9]{64}$' },
        fileName: { type: 'string' },
        mimeType: { type: 'string' },
        sizeBytes: { type: 'integer', minimum: 1 },
        pageCount: { type: 'integer', minimum: 1 },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

const ingestionDataSchema = {
  type: 'object',
  required: ['ingestion'],
  properties: { ingestion: ingestionSchema },
  additionalProperties: false,
};

export const INPUT_ENDPOINTS = Object.freeze({
  ingestText: defineEndpoint({
    id: 'ai.inputs.text',
    method: 'POST',
    path: '/ai/inputs/text',
    auth: false,
    csrf: false,
    bodySchema: {
      type: 'object',
      required: ['input', 'declaredType'],
      properties: {
        input: { type: 'string', minLength: 1, maxLength: 20_000 },
        declaredType: {
          enum: ['auto', 'natural_language', 'project_description'],
        },
      },
      additionalProperties: false,
    },
    dataSchema: ingestionDataSchema,
  }),
  ingestResume: defineEndpoint({
    id: 'ai.inputs.resume',
    method: 'POST',
    path: '/ai/inputs/resume',
    auth: false,
    csrf: false,
    dataSchema: ingestionDataSchema,
  }),
  ingestDocument: defineEndpoint({
    id: 'ai.inputs.document',
    method: 'POST',
    path: '/ai/inputs/document',
    auth: false,
    csrf: false,
    dataSchema: ingestionDataSchema,
  }),
});
