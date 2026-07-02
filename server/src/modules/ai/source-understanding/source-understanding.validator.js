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
  ].flatMap((item) => item.evidenceIds);
  if (referencedEvidence.some((evidenceId) => !evidenceIds.has(evidenceId))) {
    throw new AppError('Source understanding references missing evidence', {
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
