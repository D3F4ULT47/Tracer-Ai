export const previewStorageKey = 'tracer-ai-roadmap-preview';
const previewSaveIntentKey = 'tracer-ai-preview-save-intent';
const anonymousRoadmapSessionKey = 'tracer-ai-anonymous-roadmap-session';

function createSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function getAnonymousRoadmapSessionId() {
  const existing = localStorage.getItem(anonymousRoadmapSessionKey);
  if (existing) return existing;
  const sessionId = createSessionId();
  localStorage.setItem(anonymousRoadmapSessionKey, sessionId);
  return sessionId;
}

export function saveRoadmapPreview(preview) {
  sessionStorage.setItem(previewStorageKey, JSON.stringify(preview));
}

export function loadRoadmapPreview() {
  try {
    return JSON.parse(sessionStorage.getItem(previewStorageKey));
  } catch {
    return null;
  }
}

export function clearRoadmapPreview() {
  sessionStorage.removeItem(previewStorageKey);
}

export function rememberPreviewSaveIntent() {
  sessionStorage.setItem(previewSaveIntentKey, 'true');
}

export function consumePreviewSaveIntent() {
  const intended = sessionStorage.getItem(previewSaveIntentKey) === 'true';
  sessionStorage.removeItem(previewSaveIntentKey);
  return intended;
}
