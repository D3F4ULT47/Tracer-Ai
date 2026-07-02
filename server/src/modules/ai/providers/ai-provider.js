const requiredMethods = Object.freeze(['generateStructured']);

export function defineAiProvider(provider) {
  if (!provider?.name || typeof provider.name !== 'string') {
    throw new Error('AI providers require a name');
  }

  for (const method of requiredMethods) {
    if (typeof provider[method] !== 'function') {
      throw new Error(`AI provider ${provider.name} must implement ${method}`);
    }
  }

  return Object.freeze(provider);
}

export { requiredMethods as requiredAiProviderMethods };
