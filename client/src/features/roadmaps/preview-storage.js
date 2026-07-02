export const previewStorageKey = 'tracer-ai-roadmap-preview';
const previewSaveIntentKey = 'tracer-ai-preview-save-intent';

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
