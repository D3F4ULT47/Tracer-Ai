import assert from 'node:assert/strict';
import test from 'node:test';
import { aiSchemas } from '@tracer-ai/shared/schemas/ai';
import { AiPrompt } from '../src/modules/ai/models/ai-prompt.model.js';
import { AiRun } from '../src/modules/ai/models/ai-run.model.js';
import { AiUsageRecord } from '../src/modules/ai/models/ai-usage-record.model.js';
import { loadPrompt } from '../src/modules/ai/prompt.repository.js';
import { AiProviderRegistry } from '../src/modules/ai/providers/ai-provider.registry.js';
import { createOpenAiProvider } from '../src/modules/ai/providers/openai.provider.js';
import { validateAiOutput } from '../src/modules/ai/json.validator.js';
import { Roadmap } from '../src/modules/roadmaps/models/roadmap.model.js';
import { RoadmapActivity } from '../src/modules/roadmaps/models/roadmap-activity.model.js';
import { RoadmapContext } from '../src/modules/roadmaps/models/roadmap-context.model.js';
import { RoadmapGeneration } from '../src/modules/roadmaps/models/roadmap-generation.model.js';
import { RoadmapVersion } from '../src/modules/roadmaps/models/roadmap-version.model.js';

const validIntent = Object.freeze({
  primaryIntent: 'career_goal',
  secondaryIntent: null,
  confidence: 0.9,
  evidence: ['The learner named a target career.'],
  requiresClarification: false,
  clarificationReason: null,
});

test('all required Sprint 2 AI schemas are registered', () => {
  assert.deepEqual(Object.keys(aiSchemas).sort(), [
    'clarification',
    'dependencyGraph',
    'intent',
    'knowledge',
    'learnerAssessment',
    'learningContext',
    'planner',
    'profile',
    'resume',
    'roadmap',
    'roadmapGeneration',
    'roadmapSource',
    'sourceUnderstanding',
  ]);
});

test('AI output validation accepts a valid contract and rejects additional data', () => {
  assert.equal(validateAiOutput('intent', validIntent), validIntent);

  assert.throws(
    () => validateAiOutput('intent', { ...validIntent, unapproved: true }),
    (error) => error.code === 'AI_SCHEMA_VALIDATION_FAILED' && error.status === 422,
  );
});

test('versioned prompts load with stable SHA-256 provenance', async () => {
  const first = await loadPrompt('roadmap-generation', '1.0.0');
  const second = await loadPrompt('roadmap-generation', '1.0.0');

  assert.equal(first, second);
  assert.equal(first.version, '1.0.0');
  assert.match(first.hash, /^[a-f0-9]{64}$/);
  assert.match(first.content, /review candidate/i);
});

test('AI provider registry supports replaceable providers', () => {
  const registry = new AiProviderRegistry();
  registry.register({ name: 'example', async generateStructured() {} });

  assert.deepEqual(registry.list(), ['example']);
  assert.equal(registry.get('example').name, 'example');
  assert.throws(() => registry.register({ name: 'example', async generateStructured() {} }));
});

test('OpenAI adapter maps structured output without leaking provider objects', async () => {
  let request;
  const provider = createOpenAiProvider({
    client: {
      responses: {
        async create(parameters) {
          request = parameters;
          return {
            id: 'response-id',
            model: 'configured-model',
            output: [],
            output_text: JSON.stringify(validIntent),
            usage: {
              input_tokens: 12,
              input_tokens_details: { cached_tokens: 3 },
              output_tokens: 8,
              output_tokens_details: { reasoning_tokens: 2 },
              total_tokens: 20,
            },
          };
        },
      },
    },
  });

  const result = await provider.generateStructured({
    model: 'configured-model',
    instructions: 'Classify the request.',
    input: 'I want to become a product manager.',
    schema: aiSchemas.intent,
    schemaName: 'intent',
  });

  assert.equal(request.store, false);
  assert.equal(request.text.format.type, 'json_schema');
  assert.equal(request.text.format.strict, true);
  assert.equal('$schema' in request.text.format.schema, false);
  assert.deepEqual(result.data, validIntent);
  assert.deepEqual(result.usage, {
    inputTokens: 12,
    cachedInputTokens: 3,
    outputTokens: 8,
    reasoningTokens: 2,
    totalTokens: 20,
  });
});

test('Sprint 2 persistence uses approved collections and embedded hierarchy', () => {
  assert.equal(Roadmap.collection.collectionName, 'roadmaps');
  assert.ok(Roadmap.schema.path('phases'));
  assert.equal(RoadmapVersion.collection.collectionName, 'roadmap_versions');
  assert.equal(RoadmapContext.collection.collectionName, 'roadmap_contexts');
  assert.equal(RoadmapGeneration.collection.collectionName, 'roadmap_generations');
  assert.equal(RoadmapActivity.collection.collectionName, 'roadmap_activities');
  assert.equal(AiRun.collection.collectionName, 'ai_runs');
  assert.equal(AiUsageRecord.collection.collectionName, 'ai_usage_records');
  assert.equal(AiPrompt.collection.collectionName, 'ai_prompts');
});
