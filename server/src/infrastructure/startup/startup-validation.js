import { createPrivateKey, createPublicKey } from 'node:crypto';
import { env } from '../../config/env.js';
import { requireAiConfiguration } from '../../modules/ai/ai.config.js';
import { createOpenAiProvider } from '../../modules/ai/providers/openai.provider.js';
import { getTemporaryFileStore } from '../../modules/uploads/index.js';

function requireValue(name, value) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function decodeKey(name, value) {
  const pem = Buffer.from(requireValue(name, value), 'base64').toString('utf8');
  if (!pem.includes('KEY')) throw new Error(`${name} is not a base64-encoded PEM key`);
  return pem;
}

function validateAuthenticationConfiguration() {
  requireValue('TOKEN_HASH_SECRET', env.TOKEN_HASH_SECRET);
  requireValue('CSRF_SECRET', env.CSRF_SECRET);

  const privateKey = createPrivateKey(
    decodeKey('JWT_PRIVATE_KEY_BASE64', env.JWT_PRIVATE_KEY_BASE64),
  );
  const configuredPublicKey = createPublicKey(
    decodeKey('JWT_PUBLIC_KEY_BASE64', env.JWT_PUBLIC_KEY_BASE64),
  );
  const derivedPublicKey = createPublicKey(privateKey);

  const configuredDer = configuredPublicKey.export({ type: 'spki', format: 'der' });
  const derivedDer = derivedPublicKey.export({ type: 'spki', format: 'der' });
  if (!configuredDer.equals(derivedDer))
    throw new Error('JWT public and private keys do not match');
}

function validateAiConfiguration() {
  const configuration = requireAiConfiguration('core');
  createOpenAiProvider({
    apiKey: configuration.apiKey,
    timeout: configuration.requestTimeoutMs,
  });
}

export function validateRuntimeConfiguration() {
  requireValue('MONGODB_URI', env.MONGODB_URI);
  validateAuthenticationConfiguration();
  validateAiConfiguration();
  getTemporaryFileStore();
}
