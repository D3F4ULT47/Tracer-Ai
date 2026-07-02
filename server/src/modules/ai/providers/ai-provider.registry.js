import { defineAiProvider } from './ai-provider.js';

export class AiProviderRegistry {
  #providers = new Map();

  register(provider) {
    const definition = defineAiProvider(provider);

    if (this.#providers.has(definition.name)) {
      throw new Error(`AI provider already registered: ${definition.name}`);
    }

    this.#providers.set(definition.name, definition);
    return this;
  }

  get(name) {
    const provider = this.#providers.get(name);

    if (!provider) {
      throw new Error(`AI provider is not registered: ${name}`);
    }

    return provider;
  }

  list() {
    return Object.freeze([...this.#providers.keys()]);
  }
}

export const aiProviderRegistry = new AiProviderRegistry();
