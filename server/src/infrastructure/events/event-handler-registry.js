export class EventHandlerRegistry {
  #handlers = new Map();

  register(eventName, handler) {
    if (typeof eventName !== 'string' || typeof handler !== 'function') {
      throw new Error('Event handlers require an event name and handler function');
    }

    const handlers = this.#handlers.get(eventName) ?? [];
    this.#handlers.set(eventName, Object.freeze([...handlers, handler]));
    return this;
  }

  get(eventName) {
    return this.#handlers.get(eventName) ?? Object.freeze([]);
  }
}

export const eventHandlerRegistry = new EventHandlerRegistry();
