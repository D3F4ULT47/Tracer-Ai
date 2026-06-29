export class OAuthProviderRegistry {
  #providers = new Map();

  register(provider) {
    if (
      !provider?.name ||
      typeof provider.createAuthorization !== 'function' ||
      typeof provider.exchange !== 'function'
    ) {
      throw new Error('OAuth providers require name, createAuthorization, and exchange');
    }
    if (this.#providers.has(provider.name))
      throw new Error(`OAuth provider already registered: ${provider.name}`);
    this.#providers.set(provider.name, provider);
    return this;
  }

  get(name) {
    const provider = this.#providers.get(name);
    if (!provider) throw new Error(`Unsupported OAuth provider: ${name}`);
    return provider;
  }

  list() {
    return Object.freeze([...this.#providers.keys()]);
  }
}
