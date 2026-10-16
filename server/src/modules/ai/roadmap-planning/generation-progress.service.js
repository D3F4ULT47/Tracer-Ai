import { aiResultStore } from '../../../infrastructure/cache/ai-result-store.js';
import { AppError } from '../../../shared/app-error.js';

const sessionLifetimeMs = 15 * 60 * 1_000;

export const generationStagePercentages = Object.freeze({
  roadmap_planning: 48,
  roadmap_validation: 58,
  resource_discovery: 67,
  resource_ranking: 77,
  resource_attachment: 86,
  persistence: 94,
  workspace_ready: 100,
});

const stageOrder = Object.keys(generationStagePercentages);

function notFound() {
  return new AppError('Generation progress is not available yet', {
    status: 404,
    code: 'GENERATION_PROGRESS_NOT_FOUND',
  });
}

/**
 * Progress lives in this process and, when Redis is connected, is mirrored there so a poll that
 * lands on another API instance still finds it.
 */
export function createGenerationProgressService({
  now = () => new Date(),
  store = aiResultStore,
} = {}) {
  const sessions = new Map();
  const sharedKey = (sessionId) => `ai:progress:${sessionId}`;

  function removeExpired() {
    const cutoff = now().getTime() - sessionLifetimeMs;
    for (const [sessionId, value] of sessions) {
      if (new Date(value.updatedAt).getTime() < cutoff) sessions.delete(sessionId);
    }
  }

  function update(sessionId, stage, status = 'active') {
    if (!sessionId) return null;
    removeExpired();
    const percentage = generationStagePercentages[stage];
    if (percentage === undefined) throw new Error(`Unknown generation stage: ${stage}`);
    const previous = sessions.get(sessionId);
    if (
      previous &&
      status === 'active' &&
      stageOrder.indexOf(stage) < stageOrder.indexOf(previous.stage)
    ) {
      return previous;
    }
    const snapshot = Object.freeze({
      sessionId,
      stage,
      percentage,
      status: stage === 'workspace_ready' ? 'complete' : status,
      updatedAt: now().toISOString(),
    });
    sessions.set(sessionId, snapshot);
    if (store?.distributed()) void store.set(sharedKey(sessionId), snapshot, sessionLifetimeMs);
    return snapshot;
  }

  function get(sessionId) {
    removeExpired();
    const snapshot = sessions.get(sessionId);
    if (!snapshot) throw notFound();
    return snapshot;
  }

  async function read(sessionId) {
    removeExpired();
    const local = sessions.get(sessionId);
    if (local) return local;
    const shared = store?.distributed() ? await store.get(sharedKey(sessionId)) : null;
    if (!shared) throw notFound();
    return Object.freeze(shared);
  }

  return Object.freeze({ get, read, update });
}

export const generationProgressService = createGenerationProgressService();
