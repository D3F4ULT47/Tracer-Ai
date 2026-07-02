export class SourceHandlerRegistry {
  #handlers = new Map();

  register(handler) {
    if (!handler?.type || typeof handler.normalize !== 'function') {
      throw new Error('Source handlers require a type and normalize method');
    }
    if (this.#handlers.has(handler.type)) {
      throw new Error(`Source handler already registered: ${handler.type}`);
    }
    this.#handlers.set(handler.type, Object.freeze(handler));
    return this;
  }

  get(type) {
    const handler = this.#handlers.get(type);
    if (!handler) throw new Error(`No source handler registered for ${type}`);
    return handler;
  }

  list() {
    return [...this.#handlers.values()];
  }
}
