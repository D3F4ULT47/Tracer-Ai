import { AppError } from '../../../shared/app-error.js';

const optionalInferenceFields = Object.freeze([
  'careerDirection',
  'projectComplexity',
  'experienceSummary',
  'educationSummary',
  'technologySummary',
]);

function comparable(value) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');
}

function collectEvidence(value, evidence = []) {
  if (Array.isArray(value)) {
    for (const item of value) collectEvidence(item, evidence);
    return evidence;
  }

  if (!value || typeof value !== 'object') return evidence;
  if (Array.isArray(value.evidence)) evidence.push(...value.evidence);

  for (const [key, nested] of Object.entries(value)) {
    if (key !== 'evidence') collectEvidence(nested, evidence);
  }

  return evidence;
}

export function validateAssessmentEvidence(assessment, sourceInputs) {
  const issues = [];
  const allEvidence = [...assessment.proficiencyEvidence, ...collectEvidence(assessment)];

  for (const evidence of allEvidence) {
    const source = sourceInputs[evidence.source];
    const excerpt = comparable(evidence.excerpt);

    if (
      !source ||
      excerpt.length < 2 ||
      excerpt.length > 500 ||
      !comparable(source).includes(excerpt)
    ) {
      issues.push({ source: evidence.source, excerpt: evidence.excerpt.slice(0, 100) });
    }
  }

  for (const field of optionalInferenceFields) {
    const inference = assessment[field];
    if (inference.inferred) {
      if (inference.value == null || inference.evidence.length === 0) issues.push({ field });
    } else if (
      inference.value !== null ||
      inference.evidence.length !== 0 ||
      inference.confidence > 0.2
    ) {
      issues.push({ field });
    }
  }

  if (issues.length > 0) {
    throw new AppError('AI assessment contains unsupported evidence', {
      status: 422,
      code: 'AI_EVIDENCE_VALIDATION_FAILED',
      details: issues,
    });
  }

  return assessment;
}
