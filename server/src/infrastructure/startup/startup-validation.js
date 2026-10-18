import { createPrivateKey, createPublicKey } from 'node:crypto';
import { env } from '../../config/env.js';
import { aiConfig, requireAiConfiguration } from '../../modules/ai/ai.config.js';
import {
  checkConfiguredAiProviders,
  getConfiguredAiProvider,
} from '../../modules/ai/providers/provider.factory.js';
import { getTemporaryFileStore } from '../../modules/uploads/index.js';
import { logger } from '../logging/logger.js';

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

async function validateAiConfiguration() {
  requireAiConfiguration('core');
  getConfiguredAiProvider('core', { dataClass: 'general' });
  if (aiConfig.modelChains.fast.length > 0) {
    // Preparation without an eligible model is rejected per request (503); it must not stop generation.
    try {
      getConfiguredAiProvider('fast', { dataClass: 'general' });
    } catch (error) {
      if (error.code !== 'AI_NO_ELIGIBLE_MODEL') throw error;
      logger.warn(
        { event: 'ai.preparation_chain_unavailable', code: error.code },
        'No eligible preparation model; routed preparation will return 503',
      );
    }
  }
  await checkConfiguredAiProviders();
}

export async function validateRuntimeConfiguration() {
  requireValue('MONGODB_URI', env.MONGODB_URI);
  validateAuthenticationConfiguration();
  await validateAiConfiguration();
  getTemporaryFileStore();
}
