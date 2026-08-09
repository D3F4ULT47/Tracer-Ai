import learningContextSchema from '../schemas/ai/learning-context.schema.json' with { type: 'json' };
import roadmapSchema from '../schemas/ai/roadmap.schema.json' with { type: 'json' };
import roadmapSourceSchema from '../schemas/ai/roadmap-source.schema.json' with { type: 'json' };
import sourceUnderstandingSchema from '../schemas/ai/source-understanding.schema.json' with { type: 'json' };
import { defineEndpoint } from './endpoint.js';

function convertSchema(value, referenceRoot) {
  if (Array.isArray(value)) return value.map((entry) => convertSchema(entry, referenceRoot));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !['$schema', '$id', '$defs'].includes(key))
      .map(([key, entry]) => [
        key,
        key === '$ref'
          ? entry.replace('#/$defs/', referenceRoot)
          : convertSchema(entry, referenceRoot),
      ]),
  );
}

const context = convertSchema(learningContextSchema, '#/definitions/context/');
const contextDefinitions = convertSchema(learningContextSchema.$defs, '#/definitions/context/');
const sourceUnderstanding = convertSchema(
  sourceUnderstandingSchema,
  '#/definitions/sourceUnderstanding/',
);
const sourceUnderstandingDefinitions = convertSchema(
  sourceUnderstandingSchema.$defs,
  '#/definitions/sourceUnderstanding/',
);
sourceUnderstandingDefinitions.attribution = convertSchema(
  roadmapSourceSchema.$defs.attribution,
  '#/definitions/sourceUnderstanding/',
);
sourceUnderstandingDefinitions.location = convertSchema(
  roadmapSourceSchema.$defs.location,
  '#/definitions/sourceUnderstanding/',
);
sourceUnderstanding.properties.sourceAttributions.items = {
  $ref: '#/definitions/sourceUnderstanding/attribution',
};
const roadmap = convertSchema(roadmapSchema, '#/properties/data/definitions/roadmap/properties/');
const roadmapDefinitions = convertSchema(
  roadmapSchema.$defs,
  '#/properties/data/definitions/roadmap/properties/',
);

const generationSessionId = { type: 'string', format: 'uuid' };
const anonymousSessionId = { type: 'string', format: 'uuid' };

const generationProgress = {
  type: 'object',
  required: ['sessionId', 'stage', 'percentage', 'status', 'updatedAt'],
  properties: {
    sessionId: generationSessionId,
    stage: {
      enum: [
        'roadmap_planning',
        'roadmap_validation',
        'resource_discovery',
        'resource_ranking',
        'resource_attachment',
        'persistence',
        'workspace_ready',
      ],
    },
    percentage: { type: 'integer', minimum: 0, maximum: 100 },
    status: { enum: ['active', 'failed', 'complete'] },
    updatedAt: { type: 'string', format: 'date-time' },
  },
  additionalProperties: false,
};

export const ROADMAP_PLANNING_ENDPOINTS = Object.freeze({
  preview: defineEndpoint({
    id: 'ai.roadmap-planning.preview',
    method: 'POST',
    path: '/ai/roadmaps/preview',
    auth: false,
    csrf: false,
    bodySchema: {
      type: 'object',
      definitions: {
        context: contextDefinitions,
        sourceUnderstanding: sourceUnderstandingDefinitions,
      },
      required: ['context', 'anonymousSessionId'],
      properties: {
        context,
        sourceUnderstanding: { ...sourceUnderstanding, type: ['object', 'null'] },
        generationSessionId,
        anonymousSessionId,
      },
      additionalProperties: false,
    },
    dataSchema: {
      type: 'object',
      definitions: { roadmap: { properties: roadmapDefinitions } },
      required: ['roadmapId', 'version', 'anonymousSessionId', 'roadmap', 'generationMetadata'],
      properties: {
        roadmapId: { type: 'string', format: 'uuid' },
        version: { type: 'integer', const: 1 },
        anonymousSessionId,
        roadmap,
        generationMetadata: {
          type: 'object',
          required: [
            'runId',
            'schemaVersion',
            'promptVersion',
            'model',
            'generatedAt',
            'generationTimeMs',
            'learningContextVersion',
          ],
          properties: {
            runId: { type: 'string', format: 'uuid' },
            schemaVersion: { type: 'string', const: '2.0.0' },
            promptVersion: { type: 'string' },
            model: { type: 'string' },
            generatedAt: { type: 'string', format: 'date-time' },
            generationTimeMs: { type: 'integer', minimum: 0 },
            learningContextVersion: { type: 'integer', minimum: 1 },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  }),
  generate: defineEndpoint({
    id: 'ai.roadmap-planning.generate',
    method: 'POST',
    path: '/ai/roadmaps/generate',
    auth: true,
    csrf: true,
    bodySchema: {
      type: 'object',
      definitions: {
        context: contextDefinitions,
        sourceUnderstanding: sourceUnderstandingDefinitions,
      },
      required: ['context'],
      properties: {
        context,
        sourceUnderstanding: { ...sourceUnderstanding, type: ['object', 'null'] },
        generationSessionId,
      },
      additionalProperties: false,
    },
    dataSchema: {
      type: 'object',
      definitions: { roadmap: { properties: roadmapDefinitions } },
      required: ['roadmapId', 'version', 'roadmap', 'generationMetadata'],
      properties: {
        roadmapId: { type: 'string', format: 'uuid' },
        version: { type: 'integer', const: 1 },
        roadmap,
        generationMetadata: {
          type: 'object',
          required: [
            'runId',
            'schemaVersion',
            'promptVersion',
            'model',
            'generatedAt',
            'generationTimeMs',
            'learningContextVersion',
          ],
          properties: {
            runId: { type: 'string', format: 'uuid' },
            schemaVersion: { type: 'string', const: '2.0.0' },
            promptVersion: { type: 'string' },
            model: { type: 'string' },
            generatedAt: { type: 'string', format: 'date-time' },
            generationTimeMs: { type: 'integer', minimum: 0 },
            learningContextVersion: { type: 'integer', minimum: 1 },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
  }),
  progress: defineEndpoint({
    id: 'ai.roadmap-planning.progress',
    method: 'GET',
    path: '/ai/roadmaps/progress/:sessionId',
    auth: false,
    csrf: false,
    paramsSchema: {
      type: 'object',
      required: ['sessionId'],
      properties: { sessionId: generationSessionId },
      additionalProperties: false,
    },
    dataSchema: generationProgress,
  }),
});
