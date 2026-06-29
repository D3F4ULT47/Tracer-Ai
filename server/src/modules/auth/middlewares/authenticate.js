import { cookieNames } from '../auth.cookies.js';
import { AuthSession } from '../models/auth-session.model.js';
import { tokenService } from '../token.service.js';

export async function authenticate(request, _response, next) {
  try {
    const payload = tokenService.verifyAccessToken(request.cookies[cookieNames.access]);
    const session = await AuthSession.findOne({
      _id: payload.sid,
      userId: payload.sub,
      revokedAt: null,
    }).lean();
    if (!session) throw new Error('Session unavailable');
    request.auth = { userId: payload.sub, sessionId: payload.sid };
    next();
  } catch (error) {
    error.status = 401;
    error.code = 'AUTHENTICATION_REQUIRED';
    next(error);
  }
}
