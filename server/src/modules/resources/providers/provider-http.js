import { ResourceProviderError } from '../resource-provider.error.js';

export async function requestProviderJson({
  provider,
  url,
  headers = {},
  signal,
  timeoutMs,
  fetcher,
}) {
  const signals = [signal, AbortSignal.timeout(timeoutMs)].filter(Boolean);
  let response;
  try {
    response = await fetcher(url, {
      headers,
      signal: signals.length === 1 ? signals[0] : AbortSignal.any(signals),
    });
  } catch (error) {
    throw new ResourceProviderError(`${provider} request failed`, {
      provider,
      code:
        error?.name === 'AbortError' || error?.name === 'TimeoutError'
          ? 'RESOURCE_PROVIDER_TIMEOUT'
          : 'RESOURCE_PROVIDER_UNAVAILABLE',
      cause: error,
    });
  }
  if (!response.ok) {
    throw new ResourceProviderError(`${provider} request returned ${response.status}`, {
      provider,
      code: response.status === 429 ? 'RESOURCE_PROVIDER_RATE_LIMITED' : 'RESOURCE_PROVIDER_ERROR',
    });
  }
  return response.json();
}
