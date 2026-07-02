import { createHash } from 'node:crypto';
import { AppError } from '../../shared/app-error.js';

const trackingParameters = new Set([
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'ref',
  'source',
  'utm_campaign',
  'utm_content',
  'utm_medium',
  'utm_source',
  'utm_term',
]);

export function canonicalizeResourceUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new AppError('Resource URL is invalid', {
      status: 422,
      code: 'RESOURCE_URL_INVALID',
    });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new AppError('Resource URL must use HTTP or HTTPS', {
      status: 422,
      code: 'RESOURCE_URL_INVALID',
    });
  }
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();
  if (
    (url.protocol === 'https:' && url.port === '443') ||
    (url.protocol === 'http:' && url.port === '80')
  ) {
    url.port = '';
  }
  for (const key of [...url.searchParams.keys()]) {
    if (trackingParameters.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  url.searchParams.sort();
  if (url.pathname !== '/') url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

export function hashResourceUrl(canonicalUrl) {
  return createHash('sha256').update(canonicalUrl).digest('hex');
}
