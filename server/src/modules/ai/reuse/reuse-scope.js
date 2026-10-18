import { DATA_CLASSES } from '../providers/model-chain.js';

export const ANONYMOUS_SESSION_HEADER = 'x-tracer-anonymous-session-id';

/** Fetched without credentials, so their content is the same for every learner. */
export const PUBLIC_SOURCE_TYPES = Object.freeze(
  new Set(['github_repository', 'youtube_video', 'google_document']),
);

export const PUBLIC_SCOPE = Object.freeze({ kind: 'public', id: null });

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidOrNull(value) {
  return typeof value === 'string' && uuidPattern.test(value) ? value.toLowerCase() : null;
}

/** The learner a reusable result belongs to, or null when the requester cannot be identified. */
export function learnerScope({ ownerId = null, anonymousSessionId = null } = {}) {
  if (ownerId) return Object.freeze({ kind: 'owner', id: String(ownerId) });
  const anonymous = uuidOrNull(anonymousSessionId);
  return anonymous ? Object.freeze({ kind: 'anon', id: anonymous }) : null;
}

export function scopeKey(scope) {
  return scope.kind === 'public' ? 'public' : `${scope.kind}:${scope.id}`;
}

export function anonymousSessionIdFrom(request) {
  return uuidOrNull(request.get?.(ANONYMOUS_SESSION_HEADER) ?? request.body?.anonymousSessionId);
}

export function requestScope(request) {
  return learnerScope({
    ownerId: request.auth?.userId ?? null,
    anonymousSessionId: anonymousSessionIdFrom(request),
  });
}

/**
 * Normalised sources get a fresh `sourceId` and `capturedAt` on every request, and the model
 * cites the `sourceId`s. The fingerprint uses the sources without them, and a reused output is
 * rebound to the current `sourceId`s in the same order.
 */
export function sourceReuseHints(sources) {
  return {
    ids: sources.map((source) => source.sourceId).filter(Boolean),
    stableSources: sources.map(({ sourceId, attribution, ...source }) => ({
      ...source,
      ...(attribution
        ? { attribution: { ...attribution, sourceId: undefined, capturedAt: undefined } }
        : {}),
      sourceId: sourceId ? 'source' : undefined,
    })),
  };
}

/**
 * Source understanding is shareable only when every source is public and nothing personal is
 * present; otherwise it stays with the learner who supplied it.
 */
export function sourceScope({ sources, dataClass, learner }) {
  const allPublic =
    sources.length > 0 && sources.every((source) => PUBLIC_SOURCE_TYPES.has(source.type));
  return allPublic && dataClass === DATA_CLASSES.GENERAL ? PUBLIC_SCOPE : learner;
}
