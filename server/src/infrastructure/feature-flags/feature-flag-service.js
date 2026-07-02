import { env } from '../../config/env.js';

const reservedFlags = Object.freeze({
  ADVANCED_ANALYTICS: 'advanced-analytics',
  AI_ROADMAP_GENERATION: 'ai-roadmap-generation',
  AI_LEARNER_ASSESSMENT: 'ai-learner-assessment',
  COLLABORATION: 'collaboration',
  FLASHCARDS: 'flashcards',
  MENTOR: 'mentor',
  OCR: 'ocr',
  RESUME_UPLOAD: 'resume-upload',
  VOICE: 'voice',
});

export class LocalFeatureFlagProvider {
  #flags;

  constructor(initialFlags = {}) {
    this.#flags = new Map(Object.entries(initialFlags));
  }

  async isEnabled(flagName, _context = {}) {
    void _context;
    return this.#flags.get(flagName) === true;
  }

  async getSnapshot() {
    return Object.freeze(Object.fromEntries(this.#flags));
  }
}

export class FeatureFlagService {
  #provider;

  constructor(provider) {
    if (!provider || typeof provider.isEnabled !== 'function') {
      throw new Error('FeatureFlagService requires a provider with isEnabled');
    }

    this.#provider = provider;
  }

  async isEnabled(flagName, context = {}) {
    if (!Object.values(reservedFlags).includes(flagName)) {
      return false;
    }

    return this.#provider.isEnabled(flagName, context);
  }

  async getSnapshot(context = {}) {
    if (typeof this.#provider.getSnapshot !== 'function') return Object.freeze({});
    return this.#provider.getSnapshot(context);
  }
}

const localProvider = new LocalFeatureFlagProvider(env.FEATURE_FLAGS);
export const featureFlags = new FeatureFlagService(localProvider);
export { reservedFlags };
