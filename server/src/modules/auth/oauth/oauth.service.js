import { env } from '../../../config/env.js';
import { AppError } from '../../../shared/app-error.js';
import { tokenService } from '../token.service.js';
import { OAuthProviderRegistry } from './oauth-provider-registry.js';
import { GoogleOAuthProvider } from './providers/google.provider.js';

const registry = new OAuthProviderRegistry().register(new GoogleOAuthProvider());
const cookieName = 'tracer_oauth_transaction';

function encodeTransaction(provider, transaction) {
  const payload = Buffer.from(JSON.stringify({ provider, ...transaction })).toString('base64url');
  return `${payload}.${tokenService.hash(payload)}`;
}

function decodeTransaction(value) {
  const [payload, signature] = String(value ?? '').split('.');
  if (!payload || !signature || !tokenService.safeEqual(signature, tokenService.hash(payload))) {
    throw new AppError('OAuth transaction is invalid', {
      status: 400,
      code: 'INVALID_OAUTH_TRANSACTION',
    });
  }
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
}

export const oauthService = Object.freeze({
  async start(providerName, response) {
    const transaction = await registry.get(providerName).createAuthorization();
    const { url, ...transactionState } = transaction;
    response.cookie(cookieName, encodeTransaction(providerName, transactionState), {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
      path: '/api/v1/auth/oauth',
    });
    return url;
  },
  async callback(providerName, currentUrl, cookie, response) {
    const transaction = decodeTransaction(cookie);
    if (transaction.provider !== providerName)
      throw new AppError('OAuth provider mismatch', { code: 'OAUTH_PROVIDER_MISMATCH' });
    response.clearCookie(cookieName, { path: '/api/v1/auth/oauth' });
    const identity = await registry.get(providerName).exchange(currentUrl, transaction);
    return { provider: providerName, ...identity };
  },
  cookieName,
  providers: registry.list(),
});
