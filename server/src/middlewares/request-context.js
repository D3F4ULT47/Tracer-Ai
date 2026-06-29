import { randomUUID } from 'node:crypto';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function requestContext(request, response, next) {
  const candidate = request.get('x-request-id');
  request.id = candidate && REQUEST_ID_PATTERN.test(candidate) ? candidate : randomUUID();
  response.setHeader('x-request-id', request.id);
  next();
}
