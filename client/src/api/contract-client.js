import { AUTH_ENDPOINTS, buildContractPath } from '@tracer-ai/shared/contracts';
import { apiRequest } from './api-client.js';

let csrfToken;

export function setCsrfToken(value) {
  csrfToken = value;
}

export async function contractRequest(contract, { body, params, headers, ...options } = {}) {
  if (contract.csrf && !csrfToken) {
    const result = await apiRequest(AUTH_ENDPOINTS.csrf.path, {
      method: AUTH_ENDPOINTS.csrf.method,
    });
    csrfToken = result.data.csrfToken;
  }
  const requestHeaders = new Headers(headers);
  if (contract.csrf && csrfToken) requestHeaders.set('x-csrf-token', csrfToken);
  return apiRequest(buildContractPath(contract.path, params), {
    method: contract.method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: requestHeaders,
    ...options,
  });
}
