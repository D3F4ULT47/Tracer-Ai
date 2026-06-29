import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client';
import { env } from '../../../../config/env.js';

export class GoogleOAuthProvider {
  name = 'google';
  #configuration;

  async configuration() {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
      throw new Error('Google OAuth is not configured');
    }
    this.#configuration ??= await discovery(
      new URL('https://accounts.google.com'),
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
    );
    return this.#configuration;
  }

  async createAuthorization() {
    const configuration = await this.configuration();
    const verifier = randomPKCECodeVerifier();
    const state = randomState();
    const nonce = randomNonce();
    const challenge = await calculatePKCECodeChallenge(verifier);
    const url = buildAuthorizationUrl(configuration, {
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      scope: 'openid email profile',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    return { url, verifier, state, nonce };
  }

  async exchange(currentUrl, transaction) {
    const tokens = await authorizationCodeGrant(await this.configuration(), currentUrl, {
      pkceCodeVerifier: transaction.verifier,
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      idTokenExpected: true,
    });
    const claims = tokens.claims();
    if (!claims?.sub || !claims.email || claims.email_verified !== true) {
      throw new Error('OAuth provider did not return a verified identity');
    }
    return {
      subject: claims.sub,
      email: claims.email.toLowerCase(),
      name: claims.name ?? claims.email,
    };
  }
}
