import { AUTH_ENDPOINTS, buildContractPath } from '@tracer-ai/shared/contracts';
import { apiRequest } from './api-client.js';

let csrfToken;

export function setCsrfToken(value) {
  csrfToken = value;
}

export async function contractRequest(contract, { body, params, query, headers, ...options } = {}) {
  if (contract.csrf && !csrfToken) {
    const result = await apiRequest(AUTH_ENDPOINTS.csrf.path, {
      method: AUTH_ENDPOINTS.csrf.method,
    });
    csrfToken = result.data.csrfToken;
  }
  const requestHeaders = new Headers(headers);
  if (contract.csrf && csrfToken) requestHeaders.set('x-csrf-token', csrfToken);
  const path = buildContractPath(contract.path, params);
  const search = new URLSearchParams(
    Object.entries(query ?? {}).filter(([, value]) => value !== undefined && value !== null),
  );
  return apiRequest(`${path}${search.size ? `?${search}` : ''}`, {
    method: contract.method,
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }),
    headers: requestHeaders,
    ...options,
  });
}
