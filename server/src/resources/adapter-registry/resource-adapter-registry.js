export class ResourceAdapterRegistry {
  #adapters = new Map();

  register(adapter) {
    if (
      !adapter?.name ||
      (typeof adapter.canHandle !== 'function' && typeof adapter.search !== 'function') ||
      typeof adapter.normalize !== 'function'
    ) {
      throw new Error('Resource adapters require name, normalize, and canHandle or search');
    }

    if (this.#adapters.has(adapter.name)) {
      throw new Error(`Resource adapter already registered: ${adapter.name}`);
    }

    this.#adapters.set(adapter.name, Object.freeze({ ...adapter }));
    return this;
  }

  find(input) {
    return (
      [...this.#adapters.values()].find(
        (adapter) => typeof adapter.canHandle === 'function' && adapter.canHandle(input),
      ) ?? null
    );
  }

  get(name) {
    return this.#adapters.get(name) ?? null;
  }

  searchable() {
    return [...this.#adapters.values()].filter((adapter) => typeof adapter.search === 'function');
  }

  list() {
    return [...this.#adapters.values()];
  }
}

export const resourceAdapterRegistry = new ResourceAdapterRegistry();
