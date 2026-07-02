const RETURN_TO_KEY = 'tracer-ai-auth-return-to';

function normalizeReturnTo(value) {
  if (!value) return '/';
  if (typeof value === 'string') {
    return value.startsWith('/') && !value.startsWith('//') ? value : '/';
  }
  const path = `${value.pathname ?? '/'}${value.search ?? ''}${value.hash ?? ''}`;
  return path.startsWith('/') && !path.startsWith('//') ? path : '/';
}

export function rememberAuthReturn(value) {
  const path = normalizeReturnTo(value);
  try {
    sessionStorage.setItem(RETURN_TO_KEY, path);
  } catch {
    // Navigation state remains the fallback when storage is unavailable.
  }
  return path;
}

export function peekAuthReturn(fallback = '/') {
  try {
    return normalizeReturnTo(sessionStorage.getItem(RETURN_TO_KEY) ?? fallback);
  } catch {
    return normalizeReturnTo(fallback);
  }
}

export function consumeAuthReturn(fallback = '/') {
  const path = peekAuthReturn(fallback);
  try {
    sessionStorage.removeItem(RETURN_TO_KEY);
  } catch {
    // Storage cleanup is best-effort.
  }
  return path;
}
