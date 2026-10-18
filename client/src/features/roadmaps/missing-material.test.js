import { describe, expect, it } from 'vitest';
import { referencesMissingMaterial } from './missing-material.js';

describe('referencesMissingMaterial', () => {
  it.each([
    'Convert this into a roadmap and do tag the resources properly that are mentioned in it',
    'Turn this into a learning plan',
    'Make a roadmap from the attached report',
    'Create a roadmap based on the following',
    'Summarize this document as a roadmap',
    'Use this video to build a study plan',
    'make it into a roadmap',
  ])('asks for material when the goal points at nothing: %s', (text) => {
    expect(referencesMissingMaterial(text)).toBe(true);
  });

  it.each([
    'Learn React in 6 weeks',
    'Make it a 3 month plan for learning Go',
    'I want to become a backend developer with Node.js',
    'Prepare for the AWS Solutions Architect exam',
    'Learn this skill: Kubernetes for production deployments',
    'Convert this into a roadmap:\n1. HTML basics\n2. CSS layout\n3. JavaScript',
    'Turn this into a roadmap https://github.com/example/project',
  ])('generates normally for a real goal or included content: %s', (text) => {
    expect(referencesMissingMaterial(text)).toBe(false);
  });

  it('does not ask when a file is attached', () => {
    expect(referencesMissingMaterial('Convert this into a roadmap', { hasAttachment: true })).toBe(
      false,
    );
  });

  it('does not ask when the content is pasted in the message', () => {
    expect(
      referencesMissingMaterial(
        `Convert this into a roadmap. ${'Week one covers SQL. '.repeat(30)}`,
      ),
    ).toBe(false);
  });
});
