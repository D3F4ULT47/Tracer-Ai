import { PREPARATION_STATES } from '@tracer-ai/shared/constants';

export const SOURCE_EXCERPT_CHARACTERS = 8_000;

const names = (items = []) => items.map(({ name }) => name);

/**
 * Compact projection of a validated source understanding for the final call. Evidence excerpts
 * are dropped; requirement IDs and criticality are kept.
 */
export function sourceBrief(understanding) {
  if (!understanding) return null;
  return {
    summary: understanding.summary,
    invariantRequirements: (understanding.requirements ?? []).map(
      ({ id, statement, kind, origin, criticality }) => ({
        id,
        statement,
        kind,
        origin,
        criticality,
      }),
    ),
    concepts: names(understanding.concepts),
    technologies: names(understanding.technologies),
    prerequisites: names(understanding.prerequisites),
    milestones: names(understanding.milestones),
    preservedStructure: understanding.preservedStructure.map(({ order, title, description }) => ({
      order,
      title,
      description,
    })),
    creatorRecommendations: names(understanding.creatorRecommendations),
    assumptions: understanding.assumptions,
  };
}

/**
 * The `sourceContext` block of the final prompt, built server-side from validated data only.
 */
export function buildSourceContext({ state, understanding, preparation }) {
  const unavailableSources = (preparation?.sourceStatuses ?? [])
    .filter(({ retrievalStatus }) => retrievalStatus === 'retrieval_failed')
    .map(({ sourceType, identifier, errorCode }) => ({ sourceType, identifier, errorCode }));
  const usableUnderstanding =
    state === PREPARATION_STATES.REQUIRED || state === PREPARATION_STATES.ALREADY_AVAILABLE;

  return {
    state,
    brief: usableUnderstanding ? sourceBrief(understanding) : null,
    unreadSourceExcerpts:
      state === PREPARATION_STATES.FAILED
        ? (preparation?.sourceExcerpts ?? []).map(({ sourceType, identifier, excerpt }) => ({
            sourceType,
            identifier,
            excerpt: excerpt.slice(0, SOURCE_EXCERPT_CHARACTERS),
          }))
        : [],
    unavailableSources,
  };
}
