import { ResourceProviderError } from './resource-provider.error.js';

export class ProviderRateLimiter {
  #clock;
  #requests = new Map();

  constructor({ clock = () => Date.now() } = {}) {
    this.#clock = clock;
  }

  consume(provider, { maximum, windowMs }) {
    const now = this.#clock();
    const recent = (this.#requests.get(provider) ?? []).filter(
      (timestamp) => now - timestamp < windowMs,
    );
    if (recent.length >= maximum) {
      this.#requests.set(provider, recent);
      throw new ResourceProviderError(`${provider} discovery rate limit reached`, {
        provider,
        code: 'RESOURCE_PROVIDER_RATE_LIMITED',
      });
    }
    recent.push(now);
    this.#requests.set(provider, recent);
  }
}
