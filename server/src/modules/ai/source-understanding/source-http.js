import { AppError } from '../../../shared/app-error.js';

async function requestSource({ sourceType, url, headers = {}, fetcher, timeoutMs }) {
  let response;
  try {
    response = await fetcher(url, {
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    throw new AppError(`${sourceType} source could not be retrieved`, {
      status: 502,
      code:
        error?.name === 'TimeoutError' ? 'ROADMAP_SOURCE_TIMEOUT' : 'ROADMAP_SOURCE_UNAVAILABLE',
    });
  }
  if (!response.ok) {
    throw new AppError(`${sourceType} source returned ${response.status}`, {
      status: response.status === 404 ? 404 : 502,
      code: response.status === 404 ? 'ROADMAP_SOURCE_NOT_FOUND' : 'ROADMAP_SOURCE_REQUEST_FAILED',
    });
  }
  return response;
}

export async function requestSourceJson(options) {
  return (await requestSource(options)).json();
}

export async function requestSourceText(options) {
  return (await requestSource(options)).text();
}
