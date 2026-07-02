import { cookieNames } from '../auth.cookies.js';
import { authenticate } from './authenticate.js';

export function optionalAuthenticate(request, response, next) {
  if (!request.cookies?.[cookieNames.access]) {
    request.auth = null;
    next();
    return;
  }
  authenticate(request, response, next);
}
