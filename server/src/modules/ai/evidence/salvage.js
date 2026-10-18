import { AppError } from '../../../shared/app-error.js';
import {
  isGroundedLearnerEvidence,
  optionalInferenceFields,
  validateAssessmentEvidence,
} from '../assessment/assessment.validator.js';
import { isGroundedExcerpt } from '../source-understanding/source-understanding.validator.js';

/** Below this share of grounded evidence an output is rejected rather than salvaged. */
export const MIN_GROUNDED_SHARE = 0.5;

const insightLists = Object.freeze([
  'concepts',
  'technologies',
  'skills',
  'prerequisites',
  'milestones',
  'creatorRecommendations',
  'dependencies',
]);
const learnerLists = Object.freeze([
  'knownSkills',
  'missingSkills',
  'suggestedSkills',
  'technologyStack',
  'experienceSignals',
  'educationSignals',
]);
const alwaysCriticalKinds = new Set(['deliverable', 'evaluation_criterion']);

function enoughGrounded(grounded, total) {
  return total === 0 || (grounded > 0 && grounded / total >= MIN_GROUNDED_SHARE);
}

function report({ droppedEvidence = 0, droppedItems = 0, demotedRequirements = [] }) {
  return Object.freeze({
    droppedEvidence,
    droppedItems,
    demotedRequirements: Object.freeze([...demotedRequirements]),
    repairedRequirements: Object.freeze([]),
  });
}

/**
 * Removes source-understanding evidence that is not in its source, references to evidence that
 * does not exist, and every conclusion left without evidence. Requirements are never removed: one
 * that loses all its evidence stays and is later demoted to an inferred, noncritical requirement.
 * Returns null when too little evidence is grounded for the output to be kept.
 */
export function salvageSourceEvidence(understanding, sources) {
  const contentById = new Map(sources.map((source) => [source.sourceId, source.content]));
  const kept = new Set();
  const evidence = [];
  for (const item of understanding.evidence) {
    const content = contentById.get(item.sourceId);
    if (content === undefined || kept.has(item.evidenceId)) continue;
    if (!isGroundedExcerpt(item.excerpt, content)) continue;
    kept.add(item.evidenceId);
    evidence.push(item);
  }
  if (!enoughGrounded(evidence.length, understanding.evidence.length)) return null;

  let changed = evidence.length !== understanding.evidence.length;
  let droppedItems = 0;
  const keepIds = (ids) => {
    const remaining = ids.filter((id) => kept.has(id));
    if (remaining.length !== ids.length) changed = true;
    return remaining;
  };
  const lists = Object.fromEntries(
    insightLists.map((name) => [
      name,
      understanding[name].flatMap((item) => {
        const evidenceIds = keepIds(item.evidenceIds);
        if (item.evidenceIds.length > 0 && evidenceIds.length === 0) {
          droppedItems += 1;
          return [];
        }
        return [{ ...item, evidenceIds }];
      }),
    ]),
  );
  const demotedRequirements = [];
  const requirements = understanding.requirements?.map((requirement) => {
    const evidenceIds = keepIds(requirement.evidenceIds);
    const claimedCritical =
      requirement.origin === 'source_fact' &&
      (requirement.criticality === 'critical' || alwaysCriticalKinds.has(requirement.kind));
    if (claimedCritical && requirement.evidenceIds.length > 0 && evidenceIds.length === 0) {
      demotedRequirements.push(requirement.id);
    }
    return { ...requirement, evidenceIds };
  });
  const preservedStructure = understanding.preservedStructure.filter((item) =>
    contentById.has(item.sourceId),
  );
  droppedItems += understanding.preservedStructure.length - preservedStructure.length;
  if (droppedItems > 0) changed = true;

  return {
    understanding: {
      ...understanding,
      ...lists,
      evidence,
      preservedStructure,
      ...(requirements ? { requirements } : {}),
    },
    report: changed
      ? report({
          droppedEvidence: understanding.evidence.length - evidence.length,
          droppedItems,
          demotedRequirements,
        })
      : null,
  };
}

/**
 * Removes learner evidence that is not in the named input, every skill or signal left without
 * evidence, and turns an inconsistent optional inference into "not inferred". Returns null when
 * no proficiency evidence remains or too little evidence is grounded.
 */
export function salvageAssessmentEvidence(assessment, inputs) {
  let total = 0;
  let grounded = 0;
  let droppedItems = 0;
  const filter = (evidence) => {
    total += evidence.length;
    const kept = evidence.filter((item) => isGroundedLearnerEvidence(item, inputs));
    grounded += kept.length;
    return kept;
  };

  const proficiencyEvidence = filter(assessment.proficiencyEvidence);
  const lists = Object.fromEntries(
    learnerLists.map((name) => [
      name,
      assessment[name].flatMap((item) => {
        const evidence = filter(item.evidence);
        if (evidence.length === 0) {
          droppedItems += 1;
          return [];
        }
        return [{ ...item, evidence }];
      }),
    ]),
  );
  const optional = Object.fromEntries(
    optionalInferenceFields.map((field) => {
      const inference = assessment[field];
      const evidence = filter(inference.evidence);
      const consistent = inference.inferred
        ? inference.value != null && evidence.length > 0
        : inference.value === null && evidence.length === 0 && inference.confidence <= 0.2;
      if (consistent) return [field, { ...inference, evidence }];
      droppedItems += 1;
      return [field, { ...inference, inferred: false, value: null, confidence: 0, evidence: [] }];
    }),
  );
  if (proficiencyEvidence.length === 0 || !enoughGrounded(grounded, total)) return null;

  const droppedEvidence = total - grounded;
  return {
    assessment: { ...assessment, proficiencyEvidence, ...lists, ...optional },
    report:
      droppedEvidence > 0 || droppedItems > 0 ? report({ droppedEvidence, droppedItems }) : null,
  };
}

/**
 * Salvages a schema-valid assessment and validates the result. An output that cannot be salvaged
 * fails exactly as it would without salvage.
 */
export function salvageAndValidateAssessment(assessment, inputs) {
  const salvage = salvageAssessmentEvidence(assessment, inputs);
  if (!salvage) {
    validateAssessmentEvidence(assessment, inputs);
    throw new AppError('AI assessment contains too little supported evidence', {
      status: 422,
      code: 'AI_EVIDENCE_VALIDATION_FAILED',
    });
  }
  return {
    assessment: validateAssessmentEvidence(salvage.assessment, inputs),
    report: salvage.report,
  };
}
