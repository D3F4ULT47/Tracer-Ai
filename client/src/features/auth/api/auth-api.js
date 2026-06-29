import { AUTH_ENDPOINTS } from '@tracer-ai/shared/contracts';
import { contractRequest, setCsrfToken } from '../../../api/contract-client.js';
import { clientEnv } from '../../../config/env.js';

export const authApi = Object.freeze({
  async csrf() {
    const result = await contractRequest(AUTH_ENDPOINTS.csrf);
    setCsrfToken(result.data.csrfToken);
    return result.data.csrfToken;
  },
  register: (body) => contractRequest(AUTH_ENDPOINTS.register, { body }),
  login: (body) => contractRequest(AUTH_ENDPOINTS.login, { body }),
  logout: () => contractRequest(AUTH_ENDPOINTS.logout),
  logoutAll: () => contractRequest(AUTH_ENDPOINTS.logoutAll),
  refresh: () => contractRequest(AUTH_ENDPOINTS.refresh),
  verifyEmail: (token) => contractRequest(AUTH_ENDPOINTS.verifyEmail, { body: { token } }),
  resendVerification: (email) =>
    contractRequest(AUTH_ENDPOINTS.resendVerification, { body: { email } }),
  forgotPassword: (email) => contractRequest(AUTH_ENDPOINTS.forgotPassword, { body: { email } }),
  resetPassword: (token, password) =>
    contractRequest(AUTH_ENDPOINTS.resetPassword, { body: { token, password } }),
  sessions: () => contractRequest(AUTH_ENDPOINTS.sessions),
  revokeSession: (sessionId) =>
    contractRequest(AUTH_ENDPOINTS.revokeSession, { params: { sessionId } }),
  oauthUrl: (provider) => buildOAuthUrl(AUTH_ENDPOINTS.oauthStart.path, provider),
});

function buildOAuthUrl(path, provider) {
  return `${clientEnv.VITE_API_BASE_URL}${path.replace(':provider', encodeURIComponent(provider))}`;
}
