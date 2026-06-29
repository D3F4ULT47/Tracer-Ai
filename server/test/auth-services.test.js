import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';

process.env.TOKEN_HASH_SECRET = 'test-token-hash-secret-that-is-at-least-32-characters';
process.env.CSRF_SECRET = 'test-csrf-secret-that-is-at-least-32-characters';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.JWT_PRIVATE_KEY_BASE64 = Buffer.from(
  keys.privateKey.export({ type: 'pkcs8', format: 'pem' }),
).toString('base64');
process.env.JWT_PUBLIC_KEY_BASE64 = Buffer.from(
  keys.publicKey.export({ type: 'spki', format: 'pem' }),
).toString('base64');

const { passwordService } = await import('../src/modules/auth/password.service.js');
const { tokenService } = await import('../src/modules/auth/token.service.js');
const { OAuthProviderRegistry } =
  await import('../src/modules/auth/oauth/oauth-provider-registry.js');

test('password service hashes and verifies without retaining plaintext', async () => {
  const password = 'correct horse battery staple';
  const hash = await passwordService.hash(password);
  assert.notEqual(hash, password);
  assert.equal(await passwordService.verify(hash, password), true);
  assert.equal(await passwordService.verify(hash, 'incorrect password'), false);
});

test('access tokens use the configured asymmetric key pair', () => {
  const token = tokenService.createAccessToken({ userId: 'user-id', sessionId: 'session-id' });
  const payload = tokenService.verifyAccessToken(token);
  assert.equal(payload.sub, 'user-id');
  assert.equal(payload.sid, 'session-id');
});

test('OAuth registry supports provider adapters without provider-specific coupling', () => {
  const registry = new OAuthProviderRegistry();
  registry.register({ name: 'example', createAuthorization() {}, exchange() {} });
  assert.deepEqual(registry.list(), ['example']);
  assert.equal(registry.get('example').name, 'example');
});
