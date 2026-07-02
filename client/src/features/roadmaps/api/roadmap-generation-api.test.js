import {
  ASSESSMENT_ENDPOINTS,
  INPUT_ENDPOINTS,
  LEARNING_CONTEXT_ENDPOINTS,
  ROADMAP_PLANNING_ENDPOINTS,
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
      return { data: { roadmap: { title: 'Backend roadmap' } } };
    }
    throw new Error(`Unexpected endpoint: ${endpoint.id}`);
  });
}

beforeEach(() => {
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
});
