import { clientEnv } from '../config/env.js';

export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers);

  if (options.body != null && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${clientEnv.VITE_API_BASE_URL}${path}`, {
    credentials: 'include',
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    const error = new Error(payload?.message ?? `Request failed with status ${response.status}`);
    error.status = response.status;
    error.code = payload?.error?.code;
    error.details = payload?.error?.details;
    error.requestId = payload?.requestId ?? response.headers.get('x-request-id');
    throw error;
  }

  return payload;
}
