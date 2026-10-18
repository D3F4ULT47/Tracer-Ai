import learningContextSchema from '../schemas/ai/learning-context.schema.json' with { type: 'json' };
import roadmapSchema from '../schemas/ai/roadmap.schema.json' with { type: 'json' };
import roadmapSourceSchema from '../schemas/ai/roadmap-source.schema.json' with { type: 'json' };
import sourceUnderstandingSchema from '../schemas/ai/source-understanding.schema.json' with { type: 'json' };
import {
  PREPARATION_OPERATIONS,
  PREPARATION_STATES,
  SOURCE_RETRIEVAL_STATUSES,
  SOURCE_UNDERSTANDING_STATUSES,
} from '../constants/index.js';
import { assessmentInputProperties } from './assessment.contracts.js';
import { defineEndpoint } from './endpoint.js';
import { explicitInputSchema, questionnaireSchema } from './learning-context.contracts.js';
import { sourceRequestSchema } from './source-understanding.contracts.js';

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

function preparationSchemas(root) {
  const contextRoot = `${root}context/`;
  const sourceRoot = `${root}sourceUnderstanding/`;
  const understanding = convertSchema(sourceUnderstandingSchema, sourceRoot);
  understanding.properties.sourceAttributions.items = { $ref: `${sourceRoot}attribution` };
  return {
    context: convertSchema(learningContextSchema, contextRoot),
    contextDefinitions: convertSchema(learningContextSchema.$defs, contextRoot),
    sourceUnderstanding: understanding,
    sourceUnderstandingDefinitions: {
      ...convertSchema(sourceUnderstandingSchema.$defs, sourceRoot),
      attribution: convertSchema(roadmapSourceSchema.$defs.attribution, sourceRoot),
      location: convertSchema(roadmapSourceSchema.$defs.location, sourceRoot),
    },
  };
}

const { context, contextDefinitions, sourceUnderstanding, sourceUnderstandingDefinitions } =
  preparationSchemas('#/definitions/');
const prepared = preparationSchemas('#/properties/data/definitions/');
const roadmap = convertSchema(roadmapSchema, '#/properties/data/definitions/roadmap/properties/');
const roadmapDefinitions = convertSchema(
  roadmapSchema.$defs,
  '#/properties/data/definitions/roadmap/properties/',
);

const generationSessionId = { type: 'string', format: 'uuid' };
const anonymousSessionId = { type: 'string', format: 'uuid' };
const shortString = { type: 'string', maxLength: 500 };
const preparationStates = Object.values(PREPARATION_STATES);
const preparationOperation = { enum: Object.values(PREPARATION_OPERATIONS) };
const requirementIds = { type: 'array', maxItems: 200, items: { type: 'string', maxLength: 10 } };
const evidenceSalvageReport = {
  type: 'object',
  required: ['droppedEvidence', 'droppedItems', 'demotedRequirements', 'repairedRequirements'],
  properties: {
    droppedEvidence: { type: 'integer', minimum: 0 },
    droppedItems: { type: 'integer', minimum: 0 },
    demotedRequirements: requirementIds,
    repairedRequirements: requirementIds,
  },
  additionalProperties: false,
};
const stageDecision = {
  type: 'object',
  required: ['state', 'reason'],
  properties: {
    state: { enum: preparationStates },
    reason: shortString,
    errorCode: { type: 'string', maxLength: 100 },
  },
  additionalProperties: false,
};

export const preparationSchema = {
  type: 'object',
  required: [
    'pipelineId',
    'pipelineVersion',
    'sourceUnderstanding',
    'learnerAssessment',
    'sourceStatuses',
    'degraded',
  ],
  properties: {
    pipelineId: { type: 'string', format: 'uuid' },
    pipelineVersion: { enum: ['legacy', 'routed'] },
    routerVersion: { type: 'string', maxLength: 20 },
    case: { type: ['integer', 'null'], minimum: 1, maximum: 4 },
    sourceUnderstanding: stageDecision,
    learnerAssessment: stageDecision,
    operations: { type: 'array', maxItems: 3, items: preparationOperation },
    executedOperations: { type: 'array', maxItems: 3, items: preparationOperation },
    expectedCalls: { type: 'integer', minimum: 1, maximum: 4 },
    inputKey: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    sourceStatuses: {
      type: 'array',
      maxItems: 16,
      items: {
        type: 'object',
        required: ['sourceType', 'retrievalStatus', 'understandingStatus'],
        properties: {
          sourceType: { type: 'string', maxLength: 50 },
          identifier: { type: ['string', 'null'], maxLength: 2_000 },
          retrievalStatus: { enum: SOURCE_RETRIEVAL_STATUSES },
          understandingStatus: { enum: SOURCE_UNDERSTANDING_STATUSES },
          errorCode: { type: ['string', 'null'], maxLength: 100 },
          retryable: { type: 'boolean' },
        },
        additionalProperties: false,
      },
    },
    sourceExcerpts: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        required: ['sourceType', 'excerpt'],
        properties: {
          sourceType: { type: 'string', maxLength: 50 },
          identifier: { type: ['string', 'null'], maxLength: 2_000 },
          excerpt: { type: 'string', maxLength: 8_000 },
        },
        additionalProperties: false,
      },
    },
    degraded: { type: 'boolean' },
    notices: { type: 'array', maxItems: 20, items: shortString },
    evidenceSalvage: {
      type: 'object',
      required: ['sourceUnderstanding', 'learnerAssessment'],
      properties: {
        sourceUnderstanding: { oneOf: [{ type: 'null' }, evidenceSalvageReport] },
        learnerAssessment: { oneOf: [{ type: 'null' }, evidenceSalvageReport] },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

const requirementCoverage = {
  type: 'array',
  maxItems: 200,
  items: {
    type: 'object',
    required: ['requirementId', 'criticality', 'status'],
    properties: {
      requirementId: { type: 'string', maxLength: 10 },
      criticality: { enum: ['critical', 'noncritical'] },
      status: { enum: ['covered', 'missing'] },
      taskIds: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 100 } },
    },
    additionalProperties: false,
  },
};

const generationMetadata = {
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
    pipelineVersion: { enum: ['legacy', 'routed'] },
    degraded: { type: 'boolean' },
    warnings: { type: 'array', maxItems: 30, items: shortString },
    requirementCoverage,
  },
  additionalProperties: false,
};

const prepareData = {
  type: 'object',
  definitions: {
    context: prepared.contextDefinitions,
    sourceUnderstanding: prepared.sourceUnderstandingDefinitions,
  },
  required: ['pipelineId', 'context', 'sourceUnderstanding', 'preparation'],
  properties: {
    pipelineId: { type: 'string', format: 'uuid' },
    context: prepared.context,
    sourceUnderstanding: { ...prepared.sourceUnderstanding, type: ['object', 'null'] },
    preparation: preparationSchema,
  },
  additionalProperties: false,
};

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

const generationBody = (extra) => ({
  type: 'object',
  definitions: {
    context: contextDefinitions,
    sourceUnderstanding: sourceUnderstandingDefinitions,
  },
  properties: {
    context,
    sourceUnderstanding: { ...sourceUnderstanding, type: ['object', 'null'] },
    preparation: preparationSchema,
    generationSessionId,
    ...extra.properties,
  },
  required: extra.required,
  additionalProperties: false,
});

export const ROADMAP_PLANNING_ENDPOINTS = Object.freeze({
  prepare: defineEndpoint({
    id: 'ai.roadmap-planning.prepare',
    method: 'POST',
    path: '/ai/roadmaps/prepare',
    auth: false,
    csrf: false,
    bodySchema: {
      type: 'object',
      required: ['sources', 'assessmentInputs', 'mode', 'explicitInput'],
      properties: {
        sources: { type: 'array', minItems: 1, maxItems: 8, items: sourceRequestSchema },
        assessmentInputs: {
          type: 'object',
          minProperties: 1,
          properties: assessmentInputProperties,
          additionalProperties: false,
        },
        mode: { enum: ['quick', 'personalized'] },
        explicitInput: explicitInputSchema,
        questionnaire: questionnaireSchema,
      },
      additionalProperties: false,
    },
    dataSchema: prepareData,
  }),
  preview: defineEndpoint({
    id: 'ai.roadmap-planning.preview',
    method: 'POST',
    path: '/ai/roadmaps/preview',
    auth: false,
    csrf: false,
    bodySchema: generationBody({
      properties: { anonymousSessionId },
      required: ['context', 'anonymousSessionId'],
    }),
    dataSchema: {
      type: 'object',
      definitions: { roadmap: { properties: roadmapDefinitions } },
      required: ['roadmapId', 'version', 'anonymousSessionId', 'roadmap', 'generationMetadata'],
      properties: {
        roadmapId: { type: 'string', format: 'uuid' },
        version: { type: 'integer', const: 1 },
        anonymousSessionId,
        roadmap,
        generationMetadata,
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
    bodySchema: generationBody({ properties: {}, required: ['context'] }),
    dataSchema: {
      type: 'object',
      definitions: { roadmap: { properties: roadmapDefinitions } },
      required: ['roadmapId', 'version', 'roadmap', 'generationMetadata'],
      properties: {
        roadmapId: { type: 'string', format: 'uuid' },
        version: { type: 'integer', const: 1 },
        roadmap,
        generationMetadata,
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
