export class ResourceProviderError extends Error {
  constructor(message, { provider, code = 'RESOURCE_PROVIDER_ERROR', cause } = {}) {
    super(message, { cause });
    this.name = 'ResourceProviderError';
    this.provider = provider;
    this.code = code;
  }
}
