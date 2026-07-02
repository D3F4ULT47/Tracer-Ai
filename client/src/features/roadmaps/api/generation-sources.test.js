import { describe, expect, it } from 'vitest';
import { buildGenerationSources } from './generation-sources.js';

describe('generation input sources', () => {
  it('splits one composer value into an objective, GitHub, and YouTube sources', () => {
    const sources = buildGenerationSources({
      text: [
        'Build a production React dashboard using this repository and walkthrough.',
        'https://github.com/example/dashboard',
        'https://www.youtube.com/watch?v=video123',
      ].join('\n'),
    });

    expect(sources.map((source) => source.type)).toEqual([
      'natural_prompt',
      'github_repository',
      'youtube_video',
    ]);
    expect(sources[0].content).toBe(
      'Build a production React dashboard using this repository and walkthrough.',
    );
    expect(sources.every((source) => source.processingStatus === 'ready')).toBe(true);
  });

  it('combines text, a classified resume, GitHub, and YouTube without duplicate URLs', () => {
    const sources = buildGenerationSources({
      text: [
        'Prepare me for frontend roles.',
        'https://github.com/example/frontend',
        'https://github.com/example/frontend',
        'https://youtu.be/video123',
      ].join('\n'),
      fileIngestions: [
        {
          inputType: 'resume',
          normalizedText: 'EXPERIENCE\nFrontend internship\nSKILLS\nReact',
          metadata: { fileName: 'resume.pdf', pageCount: 1 },
        },
      ],
    });

    expect(sources).toHaveLength(4);
    expect(sources.map((source) => source.type)).toEqual([
      'natural_prompt',
      'github_repository',
      'youtube_video',
      'resume',
    ]);
  });

  it('preserves a structured AI report as its own source type', () => {
    const report = `# Phase 1\n${'Learn fundamentals. '.repeat(90)}\n# Phase 2\nBuild the project.`;
    expect(buildGenerationSources({ text: report })[0].type).toBe('ai_report');
  });

  it('separates an instruction from a pasted AI report', () => {
    const report = `Create a practical roadmap from this report.\n\n# Phase 1\n${'Learn fundamentals. '.repeat(90)}\n# Phase 2\nBuild the project.`;
    const sources = buildGenerationSources({ text: report });

    expect(sources.map((source) => source.type)).toEqual(['natural_prompt', 'ai_report']);
    expect(sources[0].content).toBe('Create a practical roadmap from this report.');
    expect(sources[1].content).toMatch(/^# Phase 1/);
  });

  it('recognizes a public Google Document as an independent source', () => {
    const sources = buildGenerationSources({
      text: 'Use this plan https://docs.google.com/document/d/document123/edit',
    });
    expect(sources.map((source) => source.type)).toEqual(['natural_prompt', 'google_document']);
  });
});
