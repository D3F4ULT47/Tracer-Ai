export class ResourceAdapterRegistry {
  #adapters = new Map();

  register(adapter) {
    if (
      !adapter?.name ||
      typeof adapter.canHandle !== 'function' ||
      typeof adapter.normalize !== 'function'
    ) {
      throw new Error('Resource adapters require name, canHandle, and normalize');
    }

    if (this.#adapters.has(adapter.name)) {
      throw new Error(`Resource adapter already registered: ${adapter.name}`);
    }

    this.#adapters.set(adapter.name, Object.freeze({ ...adapter }));
    return this;
  }

  find(input) {
    return [...this.#adapters.values()].find((adapter) => adapter.canHandle(input)) ?? null;
  }

  list() {
    return [...this.#adapters.values()];
  }
}

export const resourceAdapterRegistry = new ResourceAdapterRegistry();
