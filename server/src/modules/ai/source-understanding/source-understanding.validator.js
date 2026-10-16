import { AppError } from '../../../shared/app-error.js';

function normalized(value) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function validateSourceEvidence(understanding, sources) {
  const sourcesById = new Map(sources.map((source) => [source.sourceId, source]));
  const evidenceIds = new Set();

  for (const evidence of understanding.evidence) {
    const source = sourcesById.get(evidence.sourceId);
    if (!source || evidenceIds.has(evidence.evidenceId)) {
      throw new AppError('Source understanding contains invalid evidence references', {
        status: 422,
        code: 'SOURCE_UNDERSTANDING_EVIDENCE_INVALID',
      });
    }
    evidenceIds.add(evidence.evidenceId);
    if (!normalized(source.content).includes(normalized(evidence.excerpt))) {
      throw new AppError('Source understanding evidence is not grounded in source content', {
        status: 422,
        code: 'SOURCE_UNDERSTANDING_EVIDENCE_INVALID',
        details: { evidenceId: evidence.evidenceId, sourceId: evidence.sourceId },
      });
    }
  }

  const referencedEvidence = [
    ...understanding.concepts,
    ...understanding.technologies,
    ...understanding.skills,
    ...understanding.prerequisites,
    ...understanding.milestones,
    ...understanding.creatorRecommendations,
    ...understanding.dependencies,
    ...(understanding.requirements ?? []),
  ].flatMap((item) => item.evidenceIds);
  if (referencedEvidence.some((evidenceId) => !evidenceIds.has(evidenceId))) {
    throw new AppError('Source understanding references missing evidence', {
      status: 422,
      code: 'SOURCE_UNDERSTANDING_EVIDENCE_INVALID',
    });
  }

  const requirementIds = (understanding.requirements ?? []).map(({ id }) => id);
  if (new Set(requirementIds).size !== requirementIds.length) {
    throw new AppError('Source understanding repeats a requirement ID', {
      status: 422,
      code: 'SOURCE_UNDERSTANDING_EVIDENCE_INVALID',
    });
  }

  const sourceIds = new Set(sourcesById.keys());
  if (understanding.preservedStructure.some((item) => !sourceIds.has(item.sourceId))) {
    throw new AppError('Preserved source structure references an unknown source', {
      status: 422,
      code: 'SOURCE_UNDERSTANDING_STRUCTURE_INVALID',
    });
  }
  return understanding;
}

const alwaysCriticalKinds = new Set(['deliverable', 'evaluation_criterion']);

/**
 * Criticality is decided by rules, not by the model: only evidenced source facts can be critical,
 * and evidenced deliverables and evaluation criteria always are.
 */
export function normalizeRequirementCriticality(understanding) {
  if (!understanding.requirements) return understanding;
  const evidenceIds = new Set(understanding.evidence.map(({ evidenceId }) => evidenceId));
  const requirements = understanding.requirements.map((requirement) => {
    const evidenced =
      requirement.origin === 'source_fact' &&
      requirement.evidenceIds.some((evidenceId) => evidenceIds.has(evidenceId));
    const criticality = !evidenced
      ? 'noncritical'
      : alwaysCriticalKinds.has(requirement.kind)
        ? 'critical'
        : requirement.criticality;
    return { ...requirement, origin: evidenced ? 'source_fact' : 'inference', criticality };
  });
  return { ...understanding, requirements };
}
