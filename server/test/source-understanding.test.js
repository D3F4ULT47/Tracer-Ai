import assert from 'node:assert/strict';
import test from 'node:test';
import { SourceHandlerRegistry } from '../src/modules/ai/source-understanding/source-handler.registry.js';
import { registerDefaultSourceHandlers } from '../src/modules/ai/source-understanding/source.handlers.js';
import { createSourceUnderstandingService } from '../src/modules/ai/source-understanding/source-understanding.service.js';
import { RoadmapContext } from '../src/modules/roadmaps/models/roadmap-context.model.js';

const fixedNow = new Date('2026-07-02T00:00:00.000Z');

function jsonResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return data;
    },
  };
}

function textResponse(data, ok = true, status = 200) {
  return {
    ok,
    status,
    async text() {
      return data;
    },
  };
}

function sourceFetcher(url) {
  const value = String(url);
  if (value.includes('googleapis.com/youtube')) {
    return Promise.resolve(
      jsonResponse({
        items: [
          {
            id: 'video123',
            snippet: {
              title: 'Frontend Roadmap',
              description: 'JavaScript then React then testing.',
              channelTitle: 'Creator',
            },
            contentDetails: { duration: 'PT20M' },
          },
        ],
      }),
    );
  }
  if (value.includes('docs.google.com/document/d/document123/export')) {
    return Promise.resolve(
      textResponse('# Requirements\nLearn React.\n\n# Milestones\nShip an app.'),
    );
  }
  if (value.endsWith('/languages')) return Promise.resolve(jsonResponse({ JavaScript: 1000 }));
  if (value.endsWith('/readme')) {
    return Promise.resolve(
      jsonResponse({ content: Buffer.from('# Setup\nInstall React and Vite.').toString('base64') }),
    );
  }
  if (value.includes('/git/trees/')) {
    return Promise.resolve(
      jsonResponse({
        tree: [
          { type: 'blob', path: 'src/App.jsx' },
          { type: 'blob', path: 'package.json' },
        ],
      }),
    );
  }
  if (value.includes('api.github.com/repos/example/frontend')) {
    return Promise.resolve(
      jsonResponse({
        name: 'frontend',
        full_name: 'example/frontend',
        description: 'A React application',
        html_url: 'https://github.com/example/frontend',
        default_branch: 'main',
        owner: { login: 'example' },
      }),
    );
  }
  throw new Error(`Unexpected URL ${value}`);
}

function registry() {
  return registerDefaultSourceHandlers(new SourceHandlerRegistry(), {
    fetcher: sourceFetcher,
    githubToken: null,
    youtubeApiKey: 'test-key',
  });
}

const context = { now: () => fixedNow };

test('normalizes natural prompts, resumes, PDFs, and AI reports into canonical sources', async () => {
  const handlers = registry();
  const inputs = [
    ['natural_prompt', 'Become a frontend engineer', {}],
    ['resume', 'EXPERIENCE\nBuilt React applications.', { fileName: 'resume.pdf', pageCount: 1 }],
    [
      'pdf',
      '# Requirements\nBuild an API.\n\n# Milestones\nShip an MVP.',
      { fileName: 'brief.pdf', pageCount: 2 },
    ],
    [
      'ai_report',
      '# Phase 1\nLearn JavaScript.\n\n# Phase 2\nLearn React.',
      { reportProvider: 'Claude' },
    ],
  ];

  for (const [type, content, metadata] of inputs) {
    const result = await handlers
      .get(type)
      .normalize({ type, content, url: null, title: null, metadata }, context);
    assert.equal(result.type, type);
    assert.match(result.contentHash, /^[a-f0-9]{64}$/);
    assert.equal(result.attribution.sourceId, result.sourceId);
    assert.equal(result.attribution.sourceType, type);
  }
});

test('understands GitHub repository structure, languages, README, and dependencies', async () => {
  const result = await registry().get('github_repository').normalize(
    {
      type: 'github_repository',
      content: null,
      url: 'https://github.com/example/frontend',
      title: null,
      metadata: {},
    },
    context,
  );

  assert.deepEqual(result.structure.languages, ['JavaScript']);
  assert.ok(result.structure.paths.includes('src/App.jsx'));
  assert.deepEqual(result.structure.dependencies, ['package.json']);
  assert.equal(result.attribution.identifier, 'example/frontend@main');
  assert.match(result.content, /Install React and Vite/);
});

test('understands YouTube metadata and preserves an available transcript', async () => {
  const result = await registry()
    .get('youtube_video')
    .normalize(
      {
        type: 'youtube_video',
        content: null,
        url: 'https://www.youtube.com/watch?v=video123',
        title: null,
        metadata: { transcript: '# Step 1\nLearn JavaScript before React.' },
      },
      context,
    );

  assert.equal(result.attribution.identifier, 'video123');
  assert.equal(result.attribution.creator, 'Creator');
  assert.equal(result.structure.transcriptAvailable, true);
  assert.match(result.content, /Learn JavaScript before React/);
});

test('understands a public Google Document through its text export', async () => {
  const result = await registry().get('google_document').normalize(
    {
      type: 'google_document',
      content: null,
      url: 'https://docs.google.com/document/d/document123/edit',
      title: 'Project plan',
      metadata: {},
    },
    context,
  );

  assert.equal(result.attribution.identifier, 'document123');
  assert.equal(result.attribution.title, 'Project plan');
  assert.deepEqual(result.structure.headings, ['Requirements', 'Milestones']);
  assert.equal(result.processingStatus, 'processed');
});

function fakeRepositories() {
  const state = { prompts: [], runs: [], usage: [], completed: [], failed: [] };
  return {
    state,
    repositories: {
      prompts: {
        async ensure(value) {
          state.prompts.push(value);
        },
      },
      runs: {
        async create(value) {
          state.runs.push(value);
        },
        async complete(value) {
          state.completed.push(value);
        },
        async fail(...value) {
          state.failed.push(value);
        },
      },
      usage: {
        async record(value) {
          state.usage.push(value);
        },
      },
    },
  };
}

function providerResult(sources, invalidEvidence = false) {
  const evidence = {
    evidenceId: 'evidence-1',
    sourceId: sources[0].sourceId,
    locator: 'source',
    excerpt: invalidEvidence ? 'Unsupported conclusion' : sources[0].content.slice(0, 20),
  };
  return {
    schemaVersion: '1.0.0',
    understandingId: '11111111-1111-4111-8111-111111111111',
    generatedAt: fixedNow.toISOString(),
    mode: sources.length > 1 ? 'mixed' : 'single',
    summary: 'The sources describe a progressive frontend learning objective.',
    sourceAttributions: sources.map((source) => source.attribution),
    concepts: [
      {
        name: 'Frontend development',
        confidence: 0.9,
        evidenceIds: ['evidence-1'],
        reasoning: 'The source explicitly discusses frontend development.',
      },
    ],
    technologies: [],
    skills: [],
    prerequisites: [],
    dependencies: [],
    milestones: [],
    creatorRecommendations: [],
    preservedStructure: sources.flatMap((source) =>
      source.structure.headings.slice(0, 1).map((heading) => ({
        sourceId: source.sourceId,
        order: 1,
        title: heading,
        description: `Preserve the ${heading} section.`,
      })),
    ),
    evidence: [evidence],
    assumptions: [],
  };
}

function serviceHarness({ invalidEvidence = false, sourceRegistry = registry() } = {}) {
  const storage = fakeRepositories();
  const service = createSourceUnderstandingService({
    registry: sourceRegistry,
    now: () => fixedNow,
    promptLoader: async () => ({
      name: 'source-understanding',
      version: '1.0.0',
      hash: 'prompt-hash',
      content: 'Understand sources.',
    }),
    providerResolver: () => ({
      configuration: { provider: 'openai', model: 'configured-model' },
      provider: {
        async generateStructured({ input }) {
          const { sources } = JSON.parse(input);
          storage.state.normalizedSources = sources;
          return {
            data: providerResult(sources, invalidEvidence),
            provider: 'openai',
            model: 'configured-model',
            providerRequestId: 'response-1',
            latencyMs: 25,
            usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          };
        },
      },
    }),
    repositories: storage.repositories,
    log: { error() {}, warn() {} },
  });
  return { service, storage };
}

test('merges mixed inputs into one evidence-grounded source understanding', async () => {
  const { service, storage } = serviceHarness();
  const result = await service.understand({
    ownerId: null,
    requestId: 'request-1',
    sources: [
      { type: 'natural_prompt', content: 'Become a frontend engineer' },
      {
        type: 'pdf',
        content: '# Project Requirements\nBuild a React dashboard.',
        metadata: { fileName: 'project.pdf', pageCount: 1 },
      },
    ],
  });

  assert.equal(result.understanding.mode, 'mixed');
  assert.equal(result.understanding.sourceAttributions.length, 2);
  assert.equal(result.understanding.sourceAttributions[1].title, 'project.pdf');
  assert.ok(
    storage.state.normalizedSources.every((source) => source.processingStatus === 'processed'),
  );
  assert.equal(storage.state.runs[0].inputType, 'combined');
  assert.equal(storage.state.usage[0].outcome, 'success');
  assert.deepEqual(storage.state.completed, [result.runId]);
});

test('independently processes prompt, resume, GitHub, and YouTube before one canonical merge', async () => {
  const { service, storage } = serviceHarness();
  const result = await service.understand({
    ownerId: null,
    requestId: 'request-multi-source',
    sources: [
      { type: 'natural_prompt', content: 'Prepare me for a frontend engineering role.' },
      {
        type: 'resume',
        content: 'EXPERIENCE\nFrontend internship\nSKILLS\nReact',
        metadata: { fileName: 'resume.pdf', pageCount: 1 },
      },
      { type: 'github_repository', url: 'https://github.com/example/frontend' },
      { type: 'youtube_video', url: 'https://www.youtube.com/watch?v=video123' },
    ],
  });

  assert.equal(result.understanding.mode, 'mixed');
  assert.equal(result.understanding.sourceAttributions.length, 4);
  assert.deepEqual(
    storage.state.normalizedSources.map((source) => source.type),
    ['natural_prompt', 'resume', 'github_repository', 'youtube_video'],
  );
  assert.ok(
    storage.state.normalizedSources.every((source) => source.processingStatus === 'processed'),
  );
  assert.equal(storage.state.runs[0].inputType, 'combined');
});

test('continues canonical understanding when one source cannot be processed', async () => {
  const defaults = registry();
  const sourceRegistry = new SourceHandlerRegistry()
    .register(defaults.get('natural_prompt'))
    .register({
      type: 'youtube_video',
      async normalize() {
        throw Object.assign(new Error('YouTube unavailable'), {
          code: 'YOUTUBE_SOURCE_NOT_CONFIGURED',
        });
      },
    });
  const { service } = serviceHarness({ sourceRegistry });

  const result = await service.understand({
    ownerId: null,
    requestId: 'request-partial-source',
    sources: [
      { type: 'natural_prompt', content: 'Learn frontend engineering.' },
      { type: 'youtube_video', url: 'https://www.youtube.com/watch?v=video123' },
    ],
  });

  assert.equal(result.understanding.sourceAttributions.length, 1);
  assert.deepEqual(
    result.understanding.sourceProcessing.map(({ sourceType, status, errorCode }) => ({
      sourceType,
      status,
      errorCode,
    })),
    [
      { sourceType: 'natural_prompt', status: 'processed', errorCode: null },
      {
        sourceType: 'youtube_video',
        status: 'failed',
        errorCode: 'YOUTUBE_SOURCE_NOT_CONFIGURED',
      },
    ],
  );
});

test('rejects unsupported AI evidence and records a failed run', async () => {
  const { service, storage } = serviceHarness({ invalidEvidence: true });
  await assert.rejects(
    service.understand({
      ownerId: null,
      requestId: 'request-2',
      sources: [{ type: 'natural_prompt', content: 'Learn React' }],
    }),
    (error) => error.code === 'SOURCE_UNDERSTANDING_EVIDENCE_INVALID',
  );
  assert.equal(storage.state.usage[0].outcome, 'invalid_output');
  assert.equal(storage.state.failed.length, 1);
});

test('roadmap context persists source understanding and attribution separately from learner context', () => {
  assert.ok(RoadmapContext.schema.path('learningContext'));
  assert.ok(RoadmapContext.schema.path('sourceUnderstanding'));
  assert.ok(RoadmapContext.schema.path('sourceAttributions'));
});
