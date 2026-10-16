import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decidePreparation,
  hasSelfDescription,
  planningInputKey,
} from '../src/modules/ai/preparation/preparation-router.js';

const prompt = (content) => ({ type: 'natural_prompt', content });
const github = { type: 'github_repository', url: 'https://github.com/example/repo', content: null };
const report = { type: 'ai_report', content: '# Plan\n## Phase 1\nBuild the API.' };
const resume = {
  type: 'resume',
  content: 'Synthetic resume: backend engineer, Node.js, 2021–2024.',
};
const problemPdf = { type: 'pdf', content: 'Build an inventory service with pagination.' };

function route({ sources, assessmentInputs, explicitInput = {}, prior }) {
  return decidePreparation({ sources, assessmentInputs, explicitInput, prior });
}

test('case 1: prompt-only goal with a selected level makes no preparatory call', () => {
  const decision = route({
    sources: [prompt('Learn React from scratch')],
    assessmentInputs: { naturalLanguage: 'Learn React from scratch' },
    explicitInput: { experienceLevel: 'beginner' },
  });
  assert.equal(decision.case, 1);
  assert.deepEqual(decision.operations, []);
  assert.equal(decision.expectedCalls, 1);
  assert.equal(decision.sourceUnderstanding.state, 'NOT_REQUIRED');
  assert.equal(decision.learnerAssessment.state, 'NOT_REQUIRED');
});

test('case 1: unknown level is insufficient evidence, not an assessment call', () => {
  const decision = route({
    sources: [prompt('Learn SQL')],
    assessmentInputs: { naturalLanguage: 'Learn SQL' },
    explicitInput: {},
  });
  assert.equal(decision.case, 1);
  assert.equal(decision.learnerAssessment.state, 'INSUFFICIENT_EVIDENCE');
});

test('case 1: a matching prior understanding is reused', () => {
  const sources = [prompt('Build this'), github];
  const decision = route({
    sources,
    assessmentInputs: { naturalLanguage: 'Build this' },
    explicitInput: { experienceLevel: 'intermediate' },
    prior: { understanding: {}, inputKey: planningInputKey(sources) },
  });
  assert.equal(decision.case, 1);
  assert.equal(decision.sourceUnderstanding.state, 'ALREADY_AVAILABLE');
});

test('a prior understanding for different sources is not reused', () => {
  const decision = route({
    sources: [prompt('Build this'), github],
    assessmentInputs: { naturalLanguage: 'Build this' },
    explicitInput: { experienceLevel: 'intermediate' },
    prior: { understanding: {}, inputKey: planningInputKey([prompt('Other'), report]) },
  });
  assert.equal(decision.case, 2);
});

test('case 2: repository or structured report needs source understanding only', () => {
  for (const source of [github, report]) {
    const decision = route({
      sources: [prompt('Plan this project'), source],
      assessmentInputs: { naturalLanguage: 'Plan this project' },
      explicitInput: { experienceLevel: 'intermediate' },
    });
    assert.equal(decision.case, 2);
    assert.deepEqual(decision.operations, ['source_understanding']);
  }
});

test('case 3: planning source plus resume or self-description uses one combined call', () => {
  const withResume = route({
    sources: [prompt('Build this repo'), github, resume],
    assessmentInputs: { naturalLanguage: 'Build this repo', resumeText: resume.content },
  });
  const withSelfDescription = route({
    sources: [prompt("I've worked 3 years as a Node.js backend developer"), problemPdf],
    assessmentInputs: { naturalLanguage: "I've worked 3 years as a Node.js backend developer" },
  });
  for (const decision of [withResume, withSelfDescription]) {
    assert.equal(decision.case, 3);
    assert.deepEqual(decision.operations, ['combined_preparation']);
    assert.equal(decision.expectedCalls, 2);
  }
});

test('case 4: resume or self-description without planning sources assesses the learner only', () => {
  const withResume = route({
    sources: [prompt('Become a data engineer'), resume],
    assessmentInputs: { naturalLanguage: 'Become a data engineer', resumeText: resume.content },
  });
  const withSelfDescription = route({
    sources: [prompt("I'm a QA engineer and I know Python; get me into ML")],
    assessmentInputs: { naturalLanguage: "I'm a QA engineer and I know Python; get me into ML" },
  });
  for (const decision of [withResume, withSelfDescription]) {
    assert.equal(decision.case, 4);
    assert.deepEqual(decision.operations, ['learner_assessment']);
  }
});

test('a resume is learner evidence, never a planning source', () => {
  const decision = route({
    sources: [prompt('Get a backend job'), resume],
    assessmentInputs: { naturalLanguage: 'Get a backend job', resumeText: resume.content },
  });
  assert.equal(decision.sourceUnderstanding.state, 'NOT_REQUIRED');
});

test('unrecognised source types are treated as content that needs understanding', () => {
  const decision = route({
    sources: [prompt('Plan'), { type: 'future_type', content: 'x' }],
    assessmentInputs: { naturalLanguage: 'Plan' },
    explicitInput: { experienceLevel: 'beginner' },
  });
  assert.equal(decision.sourceUnderstanding.state, 'REQUIRED');
});

test('self-description detection ignores plain goals', () => {
  assert.equal(hasSelfDescription('Learn React from scratch'), false);
  assert.equal(hasSelfDescription('Prepare for a product manager interview'), false);
  assert.equal(hasSelfDescription('I have worked with Django for two years'), true);
  assert.equal(hasSelfDescription('5 years of experience in Java, want Kotlin'), true);
  assert.equal(hasSelfDescription("I've built two React apps"), true);
  assert.equal(hasSelfDescription('I’m a designer moving into frontend'), true);
});
