import roadmapSourceSchema from '../schemas/ai/roadmap-source.schema.json' with { type: 'json' };
import sourceUnderstandingSchema from '../schemas/ai/source-understanding.schema.json' with { type: 'json' };
import { defineEndpoint } from './endpoint.js';

function convert(value) {
  if (Array.isArray(value)) return value.map(convert);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !['$schema', '$id', '$defs'].includes(key))
      .map(([key, entry]) => {
        if (key !== '$ref') return [key, convert(entry)];
        if (entry.includes('roadmap-source')) {
          return [key, '#/properties/data/definitions/understanding/attribution'];
        }
        return [key, entry.replace('#/$defs/', '#/properties/data/definitions/understanding/')];
      }),
  );
}

const understanding = convert(sourceUnderstandingSchema);
const understandingDefinitions = {
  ...convert(sourceUnderstandingSchema.$defs),
  attribution: convert(roadmapSourceSchema.$defs.attribution),
  location: convert(roadmapSourceSchema.$defs.location),
};

const sourceRequest = {
  type: 'object',
  required: ['type'],
  properties: {
    type: {
      enum: [
        'natural_prompt',
        'resume',
        'pdf',
        'github_repository',
        'youtube_video',
        'google_document',
        'ai_report',
      ],
    },
    content: { type: ['string', 'null'], maxLength: 300000 },
    url: { type: ['string', 'null'], format: 'uri' },
    title: { type: ['string', 'null'], maxLength: 500 },
    processingStatus: { enum: ['ready'] },
    metadata: {
      type: 'object',
      properties: {
        fileName: { type: ['string', 'null'], maxLength: 500 },
        pageCount: { type: ['integer', 'null'], minimum: 1, maximum: 2000 },
        branch: { type: ['string', 'null'], maxLength: 300 },
        transcript: { type: ['string', 'null'], maxLength: 300000 },
        reportProvider: { type: ['string', 'null'], maxLength: 100 },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

export const SOURCE_UNDERSTANDING_ENDPOINTS = Object.freeze({
  create: defineEndpoint({
    id: 'ai.source-understanding.create',
    method: 'POST',
    path: '/ai/source-understanding',
    auth: false,
    csrf: false,
    bodySchema: {
      type: 'object',
      required: ['sources'],
      properties: {
        sources: { type: 'array', minItems: 1, maxItems: 8, items: sourceRequest },
      },
      additionalProperties: false,
    },
    dataSchema: {
      type: 'object',
      definitions: { understanding: understandingDefinitions },
      required: ['understanding', 'runId'],
      properties: {
        understanding,
        runId: { type: 'string', format: 'uuid' },
      },
      additionalProperties: false,
    },
  }),
});
