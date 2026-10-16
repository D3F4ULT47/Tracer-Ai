import {
  ASSESSMENT_ENDPOINTS,
  INPUT_ENDPOINTS,
  LEARNING_CONTEXT_ENDPOINTS,
  ROADMAP_PLANNING_ENDPOINTS,
  ROADMAP_WORKSPACE_ENDPOINTS,
  SOURCE_UNDERSTANDING_ENDPOINTS,
} from '@tracer-ai/shared/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { contractRequest } from '../../../api/contract-client.js';
import { roadmapGenerationApi } from './roadmap-generation-api.js';

vi.mock('../../../api/contract-client.js', () => ({ contractRequest: vi.fn() }));

function mockGenerationPipeline() {
  contractRequest.mockImplementation(async (endpoint, request = {}) => {
    if (endpoint === INPUT_ENDPOINTS.ingestText) {
      const normalizedText = request.body.input;
      return {
        data: {
          ingestion: {
            inputType: 'natural_language',
            normalizedText,
            classification: { type: 'career_goal', confidence: 0.91, signals: ['career_signal'] },
            metadata: { characterCount: normalizedText.length, inputHash: 'a'.repeat(64) },
          },
        },
      };
    }
    if (endpoint === INPUT_ENDPOINTS.ingestDocument) {
      return {
        data: {
          ingestion: {
            inputType: 'resume',
            normalizedText: 'EXPERIENCE\nFrontend internship\nSKILLS\nReact',
            classification: { type: 'resume', confidence: 0.93, signals: ['resume_sections'] },
            metadata: {
              characterCount: 49,
              inputHash: 'b'.repeat(64),
              fileName: 'profile.pdf',
              pageCount: 1,
            },
          },
        },
      };
    }
    if (endpoint === SOURCE_UNDERSTANDING_ENDPOINTS.create) {
      return { data: { understanding: { schemaVersion: '1.0.0' } } };
    }
    if (endpoint === ASSESSMENT_ENDPOINTS.create) {
      return { data: { assessment: { schemaVersion: '1.0.0' } } };
    }
    if (endpoint === LEARNING_CONTEXT_ENDPOINTS.create) {
      return { data: { context: { contextVersion: 1 } } };
    }
    if (endpoint === ROADMAP_PLANNING_ENDPOINTS.preview) {
      return {
        data: {
          roadmapId: '33333333-3333-4333-8333-333333333333',
          version: 1,
          anonymousSessionId: request.body.anonymousSessionId,
          roadmap: { title: 'Backend roadmap' },
          generationMetadata: { generatedAt: '2026-01-01T00:00:00.000Z' },
        },
      };
    }
    if (endpoint === ROADMAP_WORKSPACE_ENDPOINTS.adoptAnonymous) {
      return {
        data: {
          workspace: {
            roadmapId: request.params.roadmapId,
            currentVersion: 1,
          },
        },
      };
    }
    throw new Error(`Unexpected endpoint: ${endpoint.id}`);
  });
}

beforeEach(() => {
  localStorage.clear();
  contractRequest.mockReset();
  mockGenerationPipeline();
});

describe('roadmap generation input UX handoff', () => {
  it('keeps input classification automatic and adds selected proficiency to Learning Context', async () => {
    await roadmapGenerationApi.generate({
      goal: 'Become a backend engineer',
      experienceLevel: 'advanced',
      mode: 'quick',
    });

    expect(contractRequest).toHaveBeenCalledWith(INPUT_ENDPOINTS.ingestText, {
      body: { input: 'Become a backend engineer', declaredType: 'auto' },
    });
    expect(contractRequest).toHaveBeenCalledWith(
      LEARNING_CONTEXT_ENDPOINTS.create,
      expect.objectContaining({
        body: expect.objectContaining({
          explicitInput: expect.objectContaining({ experienceLevel: 'advanced' }),
        }),
      }),
    );
    expect(contractRequest).toHaveBeenCalledWith(
      ROADMAP_PLANNING_ENDPOINTS.preview,
      expect.objectContaining({
        body: expect.objectContaining({
          context: { contextVersion: 1 },
          generationSessionId: expect.any(String),
          anonymousSessionId: expect.any(String),
        }),
      }),
    );
  });

  it('leaves proficiency inference to the assessment when the learner is not sure', async () => {
    await roadmapGenerationApi.generate({
      goal: 'Become a backend engineer',
      experienceLevel: null,
      mode: 'quick',
    });

    const contextCall = contractRequest.mock.calls.find(
      ([endpoint]) => endpoint === LEARNING_CONTEXT_ENDPOINTS.create,
    );
    expect(contextCall[1].body.explicitInput).not.toHaveProperty('experienceLevel');
  });

  it('sends prompt, resume, GitHub, and YouTube through one source-understanding request', async () => {
    await roadmapGenerationApi.generate({
      goal: [
        'Prepare me for frontend roles.',
        'https://github.com/example/frontend',
        'https://youtu.be/video123',
      ].join('\n'),
      experienceLevel: 'intermediate',
      mode: 'quick',
      resumeFile: new File(['pdf'], 'profile.pdf', { type: 'application/pdf' }),
    });

    expect(contractRequest).toHaveBeenCalledWith(
      SOURCE_UNDERSTANDING_ENDPOINTS.create,
      expect.objectContaining({
        body: {
          sources: expect.arrayContaining([
            expect.objectContaining({ type: 'natural_prompt' }),
            expect.objectContaining({ type: 'github_repository' }),
            expect.objectContaining({ type: 'youtube_video' }),
            expect.objectContaining({ type: 'resume' }),
          ]),
        },
      }),
    );
    const sourceCall = contractRequest.mock.calls.find(
      ([endpoint]) => endpoint === SOURCE_UNDERSTANDING_ENDPOINTS.create,
    );
    expect(sourceCall[1].body.sources).toHaveLength(4);
    const contextCall = contractRequest.mock.calls.find(
      ([endpoint]) => endpoint === LEARNING_CONTEXT_ENDPOINTS.create,
    );
    expect(contextCall[1].body.explicitInput.primaryGoal).toBe('Prepare me for frontend roles.');
  });

  it('sends one idempotency key for every AI call in a single generation', async () => {
    await roadmapGenerationApi.generate({ goal: 'Become a backend engineer', mode: 'quick' });

    const aiCalls = contractRequest.mock.calls.filter(([endpoint]) =>
      [
        SOURCE_UNDERSTANDING_ENDPOINTS.create,
        ASSESSMENT_ENDPOINTS.create,
        ROADMAP_PLANNING_ENDPOINTS.preview,
      ].includes(endpoint),
    );
    const keys = aiCalls.map(([, request]) => request.headers['Idempotency-Key']);
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(aiCalls[0][1].headers['x-tracer-anonymous-session-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('retries a dropped AI request once with the same idempotency key', async () => {
    const fallback = contractRequest.getMockImplementation();
    let dropped = false;
    contractRequest.mockImplementation(async (endpoint, request) => {
      if (endpoint === ASSESSMENT_ENDPOINTS.create && !dropped) {
        dropped = true;
        throw new TypeError('Failed to fetch');
      }
      return fallback(endpoint, request);
    });

    await roadmapGenerationApi.generate({ goal: 'Become a backend engineer', mode: 'quick' });

    const assessmentCalls = contractRequest.mock.calls.filter(
      ([endpoint]) => endpoint === ASSESSMENT_ENDPOINTS.create,
    );
    expect(assessmentCalls).toHaveLength(2);
    expect(assessmentCalls[1][1].headers['Idempotency-Key']).toBe(
      assessmentCalls[0][1].headers['Idempotency-Key'],
    );
  });

  it('does not retry an AI request the server rejected', async () => {
    const fallback = contractRequest.getMockImplementation();
    contractRequest.mockImplementation(async (endpoint, request) => {
      if (endpoint === ASSESSMENT_ENDPOINTS.create) {
        throw Object.assign(new Error('Service unavailable'), { status: 503 });
      }
      return fallback(endpoint, request);
    });

    await expect(
      roadmapGenerationApi.generate({ goal: 'Become a backend engineer', mode: 'quick' }),
    ).rejects.toMatchObject({ status: 503 });
    expect(
      contractRequest.mock.calls.filter(([endpoint]) => endpoint === ASSESSMENT_ENDPOINTS.create),
    ).toHaveLength(1);
  });

  it('adopts an anonymous preview without triggering roadmap generation again', async () => {
    const result = await roadmapGenerationApi.adoptPreview({
      roadmapId: '33333333-3333-4333-8333-333333333333',
      anonymousSessionId: '99999999-9999-4999-8999-999999999999',
    });

    expect(result).toMatchObject({
      roadmapId: '33333333-3333-4333-8333-333333333333',
      version: 1,
    });
    expect(contractRequest).toHaveBeenCalledWith(ROADMAP_WORKSPACE_ENDPOINTS.adoptAnonymous, {
      params: { roadmapId: '33333333-3333-4333-8333-333333333333' },
      body: { anonymousSessionId: '99999999-9999-4999-8999-999999999999' },
    });
    expect(contractRequest).not.toHaveBeenCalledWith(
      ROADMAP_PLANNING_ENDPOINTS.generate,
      expect.anything(),
    );
  });
});
